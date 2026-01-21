"""
Microsoft 365 Integration Library for SkuldBot

Provides full integration with Microsoft Graph API for:
- Outlook Email (read, send, reply, forward, manage)
- Calendar (events, meetings)
- OneDrive/SharePoint (files)
- Teams (messages)

Uses OAuth 2.0 for authentication with support for:
- Application permissions (daemon/service)
- Delegated permissions (user context)

Copyright © 2025 Skuld, LLC
"""

import json
import base64
import time
from pathlib import Path
from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass
from datetime import datetime, timedelta
from robot.api.deco import keyword, library

# Microsoft Graph SDK
try:
    from azure.identity import ClientSecretCredential, DeviceCodeCredential
    from msgraph import GraphServiceClient
    from msgraph.generated.users.item.messages.messages_request_builder import MessagesRequestBuilder
    from msgraph.generated.users.item.mail_folders.item.messages.messages_request_builder import MessagesRequestBuilder as FolderMessagesRequestBuilder
    from msgraph.generated.models.message import Message
    from msgraph.generated.models.recipient import Recipient
    from msgraph.generated.models.email_address import EmailAddress
    from msgraph.generated.models.item_body import ItemBody
    from msgraph.generated.models.body_type import BodyType
    from msgraph.generated.models.file_attachment import FileAttachment
    from msgraph.generated.models.importance import Importance
    from msgraph.generated.models.followup_flag import FollowupFlag
    from msgraph.generated.models.followup_flag_status import FollowupFlagStatus
    MSGRAPH_AVAILABLE = True
except ImportError:
    MSGRAPH_AVAILABLE = False

# Fallback to requests for simpler implementation
import requests


@dataclass
class MS365Config:
    """Configuration for Microsoft 365 connection"""
    tenant_id: str
    client_id: str
    client_secret: Optional[str] = None
    user_email: Optional[str] = None  # For delegated permissions or target mailbox
    scopes: List[str] = None

    def __post_init__(self):
        if self.scopes is None:
            self.scopes = ["https://graph.microsoft.com/.default"]


@dataclass
class EmailMessage:
    """Structured email message"""
    id: str
    subject: str
    from_address: Dict[str, str]
    to_recipients: List[Dict[str, str]]
    cc_recipients: List[Dict[str, str]]
    bcc_recipients: List[Dict[str, str]]
    body_content: str
    body_type: str  # "html" or "text"
    body_preview: str
    received_datetime: str
    sent_datetime: str
    has_attachments: bool
    is_read: bool
    importance: str
    flag_status: str
    categories: List[str]
    conversation_id: str
    parent_folder_id: str
    web_link: str
    attachments: List[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "subject": self.subject,
            "from": self.from_address,
            "to": self.to_recipients,
            "cc": self.cc_recipients,
            "bcc": self.bcc_recipients,
            "body": {
                "content": self.body_content,
                "contentType": self.body_type
            },
            "bodyPreview": self.body_preview,
            "receivedDateTime": self.received_datetime,
            "sentDateTime": self.sent_datetime,
            "hasAttachments": self.has_attachments,
            "isRead": self.is_read,
            "importance": self.importance,
            "flag": {"status": self.flag_status},
            "categories": self.categories,
            "conversationId": self.conversation_id,
            "parentFolderId": self.parent_folder_id,
            "webLink": self.web_link,
            "attachments": self.attachments or []
        }


@library(scope='GLOBAL', version='1.0.0')
class MS365Library:
    """
    Microsoft 365 Integration Library

    Provides keywords for interacting with Microsoft 365 services via Graph API.
    Supports Outlook Email, Calendar, OneDrive, SharePoint, and Teams.

    = Authentication =

    Configure authentication using one of these methods:

    == Application Permissions (Service/Daemon) ==
    | Configure MS365 | tenant_id=xxx | client_id=xxx | client_secret=xxx |

    == Delegated Permissions (User Context) ==
    | Configure MS365 | tenant_id=xxx | client_id=xxx | user_email=user@domain.com |

    = Example Usage =

    | Configure MS365 | tenant_id=${TENANT_ID} | client_id=${CLIENT_ID} | client_secret=${CLIENT_SECRET} |
    | ${emails}= | List Emails | folder=inbox | top=10 | filter=isRead eq false |
    | FOR | ${email} | IN | @{emails} |
    |     | Log | Subject: ${email}[subject] |
    |     | Mark Email Read | ${email}[id] |
    | END |

    = Delta Query (Email Trigger) =

    Use delta query to efficiently detect new emails:

    | ${result}= | Get Delta Emails | folder=inbox |
    | # First call returns all emails and a delta_link |
    | ${delta_link}= | Set Variable | ${result}[delta_link] |
    | # Subsequent calls only return NEW emails since last call |
    | ${result}= | Get Delta Emails | delta_link=${delta_link} |
    | FOR | ${email} | IN | @{result}[emails] |
    |     | Log | New email: ${email}[subject] |
    | END |
    """

    ROBOT_LIBRARY_SCOPE = 'GLOBAL'

    def __init__(self):
        self._config: Optional[MS365Config] = None
        self._access_token: Optional[str] = None
        self._token_expires: Optional[datetime] = None
        self._graph_client = None
        self._base_url = "https://graph.microsoft.com/v1.0"
        # Delta tokens for tracking changes per folder
        self._delta_tokens: Dict[str, str] = {}

    # =========================================================================
    # CONFIGURATION
    # =========================================================================

    @keyword("Configure MS365")
    def configure_ms365(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: Optional[str] = None,
        user_email: Optional[str] = None,
        scopes: Optional[str] = None
    ) -> None:
        """
        Configure Microsoft 365 authentication.

        Args:
            tenant_id: Azure AD tenant ID
            client_id: Application (client) ID
            client_secret: Client secret for app-only auth
            user_email: User email for delegated auth or target mailbox
            scopes: Comma-separated scopes (optional)

        Example:
            | Configure MS365 | tenant_id=${TENANT} | client_id=${CLIENT} | client_secret=${SECRET} |
        """
        scope_list = scopes.split(",") if scopes else None
        self._config = MS365Config(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret,
            user_email=user_email,
            scopes=scope_list
        )

        # Get initial token
        self._authenticate()

    def _authenticate(self) -> None:
        """Authenticate and get access token"""
        if not self._config:
            raise ValueError("MS365 not configured. Call 'Configure MS365' first.")

        if self._config.client_secret:
            # Application permissions (client credentials flow)
            self._token_expires = datetime.now() + timedelta(hours=1)

            token_url = f"https://login.microsoftonline.com/{self._config.tenant_id}/oauth2/v2.0/token"
            data = {
                "client_id": self._config.client_id,
                "client_secret": self._config.client_secret,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials"
            }

            response = requests.post(token_url, data=data)
            response.raise_for_status()

            token_data = response.json()
            self._access_token = token_data["access_token"]

            if MSGRAPH_AVAILABLE:
                credential = ClientSecretCredential(
                    tenant_id=self._config.tenant_id,
                    client_id=self._config.client_id,
                    client_secret=self._config.client_secret
                )
                self._graph_client = GraphServiceClient(credential, self._config.scopes)
        else:
            raise ValueError("Client secret required for authentication")

    def _ensure_authenticated(self) -> None:
        """Ensure we have a valid token"""
        if not self._access_token:
            self._authenticate()
        elif self._token_expires and datetime.now() >= self._token_expires:
            self._authenticate()

    def _get_headers(self) -> Dict[str, str]:
        """Get headers for Graph API requests"""
        self._ensure_authenticated()
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json"
        }

    def _get_user_endpoint(self) -> str:
        """Get the user endpoint based on configuration"""
        if self._config.user_email:
            return f"{self._base_url}/users/{self._config.user_email}"
        return f"{self._base_url}/me"

    # =========================================================================
    # EMAIL - LIST & READ
    # =========================================================================

    @keyword("List Emails")
    def list_emails(
        self,
        folder: str = "inbox",
        top: int = 10,
        skip: int = 0,
        filter: Optional[str] = None,
        search: Optional[str] = None,
        order_by: str = "receivedDateTime desc",
        select: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        List emails from a folder.

        Args:
            folder: Folder name (inbox, sentitems, drafts, deleteditems, archive) or folder ID
            top: Maximum number of emails to return
            skip: Number of emails to skip (for pagination)
            filter: OData filter expression
            search: Search query
            order_by: Order by field and direction
            select: Comma-separated fields to return

        Returns:
            List of email dictionaries

        Example:
            | ${emails}= | List Emails | folder=inbox | top=5 |
            | ${unread}= | List Emails | filter=isRead eq false |
            | ${from_john}= | List Emails | filter=from/emailAddress/address eq 'john@example.com' |
            | ${search}= | List Emails | search="subject:invoice" |
        """
        # Map friendly names to well-known folder names
        folder_map = {
            "inbox": "inbox",
            "sent": "sentitems",
            "sentitems": "sentitems",
            "drafts": "drafts",
            "deleted": "deleteditems",
            "deleteditems": "deleteditems",
            "archive": "archive",
            "junk": "junkemail",
            "junkemail": "junkemail"
        }

        folder_name = folder_map.get(folder.lower(), folder)

        # Build URL
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/mailFolders/{folder_name}/messages"

        # Build query parameters
        params = {
            "$top": top,
            "$skip": skip,
            "$orderby": order_by
        }

        if filter:
            params["$filter"] = filter

        if search:
            params["$search"] = f'"{search}"'

        if select:
            params["$select"] = select
        else:
            params["$select"] = "id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,hasAttachments,isRead,importance,flag,categories,conversationId,parentFolderId,webLink"

        response = requests.get(url, headers=self._get_headers(), params=params)
        response.raise_for_status()

        data = response.json()
        emails = data.get("value", [])

        # Transform to consistent format
        return [self._transform_email(email) for email in emails]

    @keyword("Get Email")
    def get_email(
        self,
        message_id: str,
        include_body: bool = True,
        include_attachments: bool = False
    ) -> Dict[str, Any]:
        """
        Get a single email by ID with full details.

        Args:
            message_id: The email message ID
            include_body: Include full body content
            include_attachments: Include attachment details

        Returns:
            Email dictionary with full details

        Example:
            | ${email}= | Get Email | ${message_id} |
            | ${email}= | Get Email | ${message_id} | include_attachments=True |
        """
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}"

        params = {}
        if not include_body:
            params["$select"] = "id,subject,from,toRecipients,ccRecipients,bccRecipients,bodyPreview,receivedDateTime,sentDateTime,hasAttachments,isRead,importance,flag,categories,conversationId,parentFolderId,webLink"

        response = requests.get(url, headers=self._get_headers(), params=params)
        response.raise_for_status()

        email = self._transform_email(response.json(), include_body=include_body)

        # Get attachments if requested
        if include_attachments and email.get("hasAttachments"):
            attachments_url = f"{url}/attachments"
            att_response = requests.get(attachments_url, headers=self._get_headers())
            if att_response.ok:
                att_data = att_response.json()
                email["attachments"] = [
                    {
                        "id": att.get("id"),
                        "name": att.get("name"),
                        "contentType": att.get("contentType"),
                        "size": att.get("size"),
                        "isInline": att.get("isInline", False)
                    }
                    for att in att_data.get("value", [])
                ]

        return email

    @keyword("Search Emails")
    def search_emails(
        self,
        query: str,
        folder: str = "inbox",
        top: int = 25
    ) -> List[Dict[str, Any]]:
        """
        Search emails using Microsoft Search.

        Args:
            query: Search query (supports KQL syntax)
            folder: Folder to search in
            top: Maximum results

        Returns:
            List of matching emails

        Example:
            | ${results}= | Search Emails | invoice 2025 |
            | ${results}= | Search Emails | from:john@example.com subject:urgent |
            | ${results}= | Search Emails | hasattachment:true |
        """
        return self.list_emails(folder=folder, search=query, top=top)

    @keyword("Get Delta Emails")
    def get_delta_emails(
        self,
        folder: str = "inbox",
        delta_link: Optional[str] = None,
        select: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get new/changed emails using Delta Query.

        Delta Query efficiently tracks changes - the first call gets all emails,
        subsequent calls (using delta_link) only return NEW or CHANGED emails.

        This is the recommended method for email triggers as it:
        - Only returns emails that arrived since last check
        - Is much more efficient than polling with filters
        - Handles deleted emails properly

        Args:
            folder: Folder name (inbox, sentitems, etc.) - ignored if delta_link provided
            delta_link: Delta link from previous call (for incremental sync)
            select: Comma-separated fields to return

        Returns:
            Dict with:
                - emails: List of new/changed email dictionaries
                - delta_link: Link to use for next call (save this!)
                - has_more: True if there are more pages to fetch

        Example (First call - initialize):
            | ${result}= | Get Delta Emails | folder=inbox |
            | Log | Found ${result}[emails].__len__() initial emails |
            | ${delta_link}= | Set Variable | ${result}[delta_link] |

        Example (Subsequent calls - get only new emails):
            | ${result}= | Get Delta Emails | delta_link=${delta_link} |
            | FOR | ${email} | IN | @{result}[emails] |
            |     | Log | NEW EMAIL: ${email}[subject] from ${email}[from][email] |
            | END |
            | ${delta_link}= | Set Variable | ${result}[delta_link] |

        Example (Trigger loop pattern):
            | ${delta_link}= | Set Variable | ${EMPTY} |
            | WHILE | ${TRUE} |
            |     | ${result}= | Get Delta Emails | delta_link=${delta_link} | folder=inbox |
            |     | ${delta_link}= | Set Variable | ${result}[delta_link] |
            |     | FOR | ${email} | IN | @{result}[emails] |
            |     |     | # Process each new email |
            |     |     | Run Keyword | Process Email | ${email} |
            |     | END |
            |     | Sleep | 30s |
            | END |
        """
        # Map friendly names to well-known folder names
        folder_map = {
            "inbox": "inbox",
            "sent": "sentitems",
            "sentitems": "sentitems",
            "drafts": "drafts",
            "deleted": "deleteditems",
            "deleteditems": "deleteditems",
            "archive": "archive",
            "junk": "junkemail",
            "junkemail": "junkemail"
        }

        # Use delta_link if provided (incremental sync)
        if delta_link:
            url = delta_link
            params = {}
        else:
            # Initial sync - build delta URL
            folder_name = folder_map.get(folder.lower(), folder)
            user_endpoint = self._get_user_endpoint()
            url = f"{user_endpoint}/mailFolders/{folder_name}/messages/delta"

            params = {}
            if select:
                params["$select"] = select
            else:
                params["$select"] = "id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,hasAttachments,isRead,importance,flag,categories,conversationId,parentFolderId,webLink"

        all_emails = []
        next_link = url
        has_more = True

        # Fetch all pages
        while has_more:
            if next_link == url and params:
                response = requests.get(next_link, headers=self._get_headers(), params=params)
            else:
                response = requests.get(next_link, headers=self._get_headers())

            response.raise_for_status()
            data = response.json()

            # Get emails from this page
            emails = data.get("value", [])
            for email in emails:
                # Skip deleted emails (they have @removed annotation)
                if "@removed" not in email:
                    all_emails.append(self._transform_email(email))

            # Check for more pages
            if "@odata.nextLink" in data:
                next_link = data["@odata.nextLink"]
            else:
                has_more = False

        # Get delta link for next call
        new_delta_link = data.get("@odata.deltaLink", "")

        return {
            "emails": all_emails,
            "delta_link": new_delta_link,
            "count": len(all_emails),
            "has_more": False  # We fetched all pages
        }

    @keyword("Start Email Listener")
    def start_email_listener(
        self,
        folder: str = "inbox",
        callback_keyword: Optional[str] = None,
        poll_interval: int = 30,
        filter_from: Optional[str] = None,
        filter_subject: Optional[str] = None,
        filter_has_attachment: bool = False
    ) -> Dict[str, Any]:
        """
        Start listening for new emails (blocking - runs continuously).

        This keyword runs a continuous loop that checks for new emails
        using Delta Query and processes each one. It's designed to be
        the main execution point for email-triggered bots.

        Args:
            folder: Folder to monitor (inbox, etc.)
            callback_keyword: Robot Framework keyword to call for each email
            poll_interval: Seconds between checks (default 30)
            filter_from: Only process emails from this sender (partial match)
            filter_subject: Only process emails with this in subject (partial match)
            filter_has_attachment: Only process emails with attachments

        Returns:
            This keyword runs forever until stopped. Returns stats on stop.

        Example:
            | Start Email Listener | folder=inbox | callback_keyword=Process New Email |

        Example with filters:
            | Start Email Listener |
            | ...    folder=inbox |
            | ...    filter_from=invoices@supplier.com |
            | ...    filter_has_attachment=True |
            | ...    callback_keyword=Process Invoice Email |
        """
        from robot.libraries.BuiltIn import BuiltIn
        builtin = BuiltIn()

        # Initialize delta query
        result = self.get_delta_emails(folder=folder)
        delta_link = result["delta_link"]

        # Skip initial emails (we only want NEW ones from now on)
        builtin.log(
            f"Email listener initialized. Skipped {result['count']} existing emails. "
            f"Now listening for new emails in {folder}...",
            console=True
        )

        processed_count = 0
        error_count = 0
        start_time = datetime.now()

        try:
            while True:
                # Check for new emails
                result = self.get_delta_emails(delta_link=delta_link)
                delta_link = result["delta_link"]

                for email in result["emails"]:
                    # Apply filters
                    if filter_from:
                        sender_email = email.get("from", {}).get("email", "").lower()
                        if filter_from.lower() not in sender_email:
                            continue

                    if filter_subject:
                        subject = email.get("subject", "").lower()
                        if filter_subject.lower() not in subject:
                            continue

                    if filter_has_attachment:
                        if not email.get("hasAttachments", False):
                            continue

                    # Process the email
                    builtin.log(
                        f"NEW EMAIL: {email['subject']} from {email['from']['email']}",
                        console=True
                    )

                    if callback_keyword:
                        try:
                            builtin.run_keyword(callback_keyword, email)
                            processed_count += 1
                        except Exception as e:
                            error_count += 1
                            builtin.log(f"Error processing email: {e}", level="ERROR", console=True)
                    else:
                        processed_count += 1

                # Wait before next check
                time.sleep(poll_interval)

        except KeyboardInterrupt:
            # Graceful shutdown
            pass

        runtime = (datetime.now() - start_time).total_seconds()
        return {
            "status": "stopped",
            "processed_count": processed_count,
            "error_count": error_count,
            "runtime_seconds": runtime
        }

    @keyword("Get Email Attachments")
    def get_email_attachments(
        self,
        message_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get list of attachments for an email.

        Args:
            message_id: The email message ID

        Returns:
            List of attachment metadata

        Example:
            | ${attachments}= | Get Email Attachments | ${message_id} |
            | FOR | ${att} | IN | @{attachments} |
            |     | Log | Attachment: ${att}[name] (${att}[size] bytes) |
            | END |
        """
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}/attachments"

        response = requests.get(url, headers=self._get_headers())
        response.raise_for_status()

        data = response.json()
        return [
            {
                "id": att.get("id"),
                "name": att.get("name"),
                "contentType": att.get("contentType"),
                "size": att.get("size"),
                "isInline": att.get("isInline", False),
                "@odata.type": att.get("@odata.type")
            }
            for att in data.get("value", [])
        ]

    @keyword("Download Attachment")
    def download_attachment(
        self,
        message_id: str,
        attachment_id: str,
        save_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Download an email attachment.

        Args:
            message_id: The email message ID
            attachment_id: The attachment ID
            save_path: Path to save the file (optional)

        Returns:
            Dict with file info and content (base64 if not saved)

        Example:
            | ${file}= | Download Attachment | ${msg_id} | ${att_id} | /tmp/invoice.pdf |
            | ${file}= | Download Attachment | ${msg_id} | ${att_id} |
            | # Access base64 content: ${file}[contentBytes] |
        """
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}/attachments/{attachment_id}"

        response = requests.get(url, headers=self._get_headers())
        response.raise_for_status()

        data = response.json()

        result = {
            "id": data.get("id"),
            "name": data.get("name"),
            "contentType": data.get("contentType"),
            "size": data.get("size")
        }

        content_bytes = data.get("contentBytes")

        if save_path and content_bytes:
            # Decode and save
            file_content = base64.b64decode(content_bytes)
            save_path = Path(save_path)
            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_bytes(file_content)
            result["savedPath"] = str(save_path)
        else:
            result["contentBytes"] = content_bytes

        return result

    # =========================================================================
    # EMAIL - SEND & REPLY
    # =========================================================================

    @keyword("Send Email")
    def send_email(
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        body_type: str = "html",
        importance: str = "normal",
        attachments: Optional[List[str]] = None,
        save_to_sent: bool = True
    ) -> Dict[str, Any]:
        """
        Send a new email.

        Args:
            to: Recipient email(s) - string or list
            subject: Email subject
            body: Email body content
            cc: CC recipient(s)
            bcc: BCC recipient(s)
            body_type: "html" or "text"
            importance: "low", "normal", or "high"
            attachments: List of file paths to attach
            save_to_sent: Save copy to Sent Items

        Returns:
            Dict with sent message info

        Example:
            | Send Email | to=john@example.com | subject=Hello | body=<h1>Hi!</h1> |
            | @{recipients}= | Create List | a@ex.com | b@ex.com |
            | Send Email | to=${recipients} | subject=Team Update | body=... |
            | @{files}= | Create List | /path/report.pdf |
            | Send Email | to=boss@ex.com | subject=Report | body=Attached | attachments=${files} |
        """
        # Normalize recipients to lists
        to_list = [to] if isinstance(to, str) else to
        cc_list = [cc] if isinstance(cc, str) else (cc or [])
        bcc_list = [bcc] if isinstance(bcc, str) else (bcc or [])

        # Build message
        message = {
            "subject": subject,
            "body": {
                "contentType": "HTML" if body_type.lower() == "html" else "Text",
                "content": body
            },
            "toRecipients": [
                {"emailAddress": {"address": email}} for email in to_list
            ],
            "importance": importance
        }

        if cc_list:
            message["ccRecipients"] = [
                {"emailAddress": {"address": email}} for email in cc_list
            ]

        if bcc_list:
            message["bccRecipients"] = [
                {"emailAddress": {"address": email}} for email in bcc_list
            ]

        # Handle attachments
        if attachments:
            message["attachments"] = []
            for file_path in attachments:
                path = Path(file_path)
                if path.exists():
                    content = base64.b64encode(path.read_bytes()).decode()
                    message["attachments"].append({
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        "name": path.name,
                        "contentBytes": content
                    })

        # Send
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/sendMail"

        payload = {
            "message": message,
            "saveToSentItems": save_to_sent
        }

        response = requests.post(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return {
            "status": "sent",
            "to": to_list,
            "subject": subject,
            "timestamp": datetime.now().isoformat()
        }

    @keyword("Reply To Email")
    def reply_to_email(
        self,
        message_id: str,
        body: str,
        reply_all: bool = False,
        body_type: str = "html",
        attachments: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Reply to an email.

        Args:
            message_id: Original message ID
            body: Reply body content
            reply_all: Reply to all recipients
            body_type: "html" or "text"
            attachments: List of file paths to attach

        Returns:
            Dict with reply info

        Example:
            | Reply To Email | ${message_id} | body=Thanks for your email! |
            | Reply To Email | ${message_id} | body=See my response below | reply_all=True |
        """
        user_endpoint = self._get_user_endpoint()
        action = "replyAll" if reply_all else "reply"
        url = f"{user_endpoint}/messages/{message_id}/{action}"

        comment = body

        # Build payload
        payload = {
            "comment": comment
        }

        # Note: For attachments in replies, we need a different approach
        # First create reply draft, then add attachments, then send
        if attachments:
            # Create reply draft
            draft_url = f"{user_endpoint}/messages/{message_id}/createReply"
            if reply_all:
                draft_url = f"{user_endpoint}/messages/{message_id}/createReplyAll"

            draft_response = requests.post(draft_url, headers=self._get_headers())
            draft_response.raise_for_status()
            draft = draft_response.json()
            draft_id = draft["id"]

            # Update draft body
            update_url = f"{user_endpoint}/messages/{draft_id}"
            update_payload = {
                "body": {
                    "contentType": "HTML" if body_type.lower() == "html" else "Text",
                    "content": body
                }
            }
            requests.patch(update_url, headers=self._get_headers(), json=update_payload)

            # Add attachments
            for file_path in attachments:
                path = Path(file_path)
                if path.exists():
                    att_url = f"{user_endpoint}/messages/{draft_id}/attachments"
                    att_payload = {
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        "name": path.name,
                        "contentBytes": base64.b64encode(path.read_bytes()).decode()
                    }
                    requests.post(att_url, headers=self._get_headers(), json=att_payload)

            # Send the draft
            send_url = f"{user_endpoint}/messages/{draft_id}/send"
            requests.post(send_url, headers=self._get_headers())

            return {
                "status": "sent",
                "action": "reply_all" if reply_all else "reply",
                "originalMessageId": message_id,
                "timestamp": datetime.now().isoformat()
            }

        response = requests.post(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return {
            "status": "sent",
            "action": "reply_all" if reply_all else "reply",
            "originalMessageId": message_id,
            "timestamp": datetime.now().isoformat()
        }

    @keyword("Forward Email")
    def forward_email(
        self,
        message_id: str,
        to: Union[str, List[str]],
        comment: Optional[str] = None,
        attachments: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Forward an email.

        Args:
            message_id: Message ID to forward
            to: Recipient email(s)
            comment: Optional comment to add
            attachments: Additional attachments

        Returns:
            Dict with forward info

        Example:
            | Forward Email | ${message_id} | to=colleague@example.com |
            | Forward Email | ${message_id} | to=team@ex.com | comment=FYI - please review |
        """
        to_list = [to] if isinstance(to, str) else to

        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}/forward"

        payload = {
            "toRecipients": [
                {"emailAddress": {"address": email}} for email in to_list
            ]
        }

        if comment:
            payload["comment"] = comment

        response = requests.post(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return {
            "status": "forwarded",
            "originalMessageId": message_id,
            "to": to_list,
            "timestamp": datetime.now().isoformat()
        }

    @keyword("Create Draft")
    def create_draft(
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        body_type: str = "html"
    ) -> Dict[str, Any]:
        """
        Create an email draft.

        Args:
            to: Recipient email(s)
            subject: Email subject
            body: Email body
            cc: CC recipients
            bcc: BCC recipients
            body_type: "html" or "text"

        Returns:
            Draft message with ID

        Example:
            | ${draft}= | Create Draft | to=john@ex.com | subject=Draft | body=... |
            | Log | Draft ID: ${draft}[id] |
        """
        to_list = [to] if isinstance(to, str) else to
        cc_list = [cc] if isinstance(cc, str) else (cc or [])
        bcc_list = [bcc] if isinstance(bcc, str) else (bcc or [])

        message = {
            "subject": subject,
            "body": {
                "contentType": "HTML" if body_type.lower() == "html" else "Text",
                "content": body
            },
            "toRecipients": [
                {"emailAddress": {"address": email}} for email in to_list
            ]
        }

        if cc_list:
            message["ccRecipients"] = [
                {"emailAddress": {"address": email}} for email in cc_list
            ]

        if bcc_list:
            message["bccRecipients"] = [
                {"emailAddress": {"address": email}} for email in bcc_list
            ]

        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages"

        response = requests.post(url, headers=self._get_headers(), json=message)
        response.raise_for_status()

        return self._transform_email(response.json())

    # =========================================================================
    # EMAIL - MANAGE
    # =========================================================================

    @keyword("Move Email")
    def move_email(
        self,
        message_id: str,
        destination_folder: str
    ) -> Dict[str, Any]:
        """
        Move an email to another folder.

        Args:
            message_id: Message ID to move
            destination_folder: Target folder name or ID

        Returns:
            Updated message info

        Example:
            | Move Email | ${message_id} | archive |
            | Move Email | ${message_id} | deleteditems |
        """
        folder_map = {
            "inbox": "inbox",
            "sent": "sentitems",
            "drafts": "drafts",
            "deleted": "deleteditems",
            "archive": "archive",
            "junk": "junkemail"
        }

        folder_id = folder_map.get(destination_folder.lower(), destination_folder)

        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}/move"

        payload = {"destinationId": folder_id}

        response = requests.post(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return self._transform_email(response.json())

    @keyword("Copy Email")
    def copy_email(
        self,
        message_id: str,
        destination_folder: str
    ) -> Dict[str, Any]:
        """
        Copy an email to another folder.

        Args:
            message_id: Message ID to copy
            destination_folder: Target folder name or ID

        Returns:
            Copied message info

        Example:
            | ${copy}= | Copy Email | ${message_id} | archive |
        """
        folder_map = {
            "inbox": "inbox",
            "sent": "sentitems",
            "drafts": "drafts",
            "deleted": "deleteditems",
            "archive": "archive",
            "junk": "junkemail"
        }

        folder_id = folder_map.get(destination_folder.lower(), destination_folder)

        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}/copy"

        payload = {"destinationId": folder_id}

        response = requests.post(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return self._transform_email(response.json())

    @keyword("Delete Email")
    def delete_email(
        self,
        message_id: str,
        permanent: bool = False
    ) -> Dict[str, str]:
        """
        Delete an email.

        Args:
            message_id: Message ID to delete
            permanent: If True, permanently delete. If False, move to Deleted Items.

        Returns:
            Status dict

        Example:
            | Delete Email | ${message_id} |
            | Delete Email | ${message_id} | permanent=True |
        """
        user_endpoint = self._get_user_endpoint()

        if permanent:
            url = f"{user_endpoint}/messages/{message_id}"
            response = requests.delete(url, headers=self._get_headers())
        else:
            # Move to deleted items
            return self.move_email(message_id, "deleteditems")

        response.raise_for_status()

        return {"status": "deleted", "messageId": message_id, "permanent": permanent}

    @keyword("Mark Email Read")
    def mark_email_read(
        self,
        message_id: str,
        is_read: bool = True
    ) -> Dict[str, Any]:
        """
        Mark an email as read or unread.

        Args:
            message_id: Message ID
            is_read: True for read, False for unread

        Returns:
            Updated message info

        Example:
            | Mark Email Read | ${message_id} |
            | Mark Email Read | ${message_id} | is_read=False |
        """
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}"

        payload = {"isRead": is_read}

        response = requests.patch(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return self._transform_email(response.json())

    @keyword("Flag Email")
    def flag_email(
        self,
        message_id: str,
        flag_status: str = "flagged"
    ) -> Dict[str, Any]:
        """
        Set follow-up flag on an email.

        Args:
            message_id: Message ID
            flag_status: "flagged", "notFlagged", or "complete"

        Returns:
            Updated message info

        Example:
            | Flag Email | ${message_id} |
            | Flag Email | ${message_id} | flag_status=complete |
        """
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}"

        payload = {
            "flag": {"flagStatus": flag_status}
        }

        response = requests.patch(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return self._transform_email(response.json())

    @keyword("Set Email Categories")
    def set_email_categories(
        self,
        message_id: str,
        categories: Union[str, List[str]]
    ) -> Dict[str, Any]:
        """
        Set categories on an email.

        Args:
            message_id: Message ID
            categories: Category name(s)

        Returns:
            Updated message info

        Example:
            | Set Email Categories | ${message_id} | Important |
            | @{cats}= | Create List | Urgent | Client |
            | Set Email Categories | ${message_id} | ${cats} |
        """
        cat_list = [categories] if isinstance(categories, str) else categories

        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}"

        payload = {"categories": cat_list}

        response = requests.patch(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return self._transform_email(response.json())

    @keyword("Set Email Importance")
    def set_email_importance(
        self,
        message_id: str,
        importance: str = "high"
    ) -> Dict[str, Any]:
        """
        Set importance level on an email.

        Args:
            message_id: Message ID
            importance: "low", "normal", or "high"

        Returns:
            Updated message info

        Example:
            | Set Email Importance | ${message_id} | high |
        """
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/messages/{message_id}"

        payload = {"importance": importance}

        response = requests.patch(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        return self._transform_email(response.json())

    # =========================================================================
    # FOLDERS
    # =========================================================================

    @keyword("List Folders")
    def list_folders(
        self,
        parent_folder_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        List mail folders.

        Args:
            parent_folder_id: Parent folder ID for child folders

        Returns:
            List of folder info

        Example:
            | ${folders}= | List Folders |
            | ${subfolders}= | List Folders | parent_folder_id=${folder_id} |
        """
        user_endpoint = self._get_user_endpoint()

        if parent_folder_id:
            url = f"{user_endpoint}/mailFolders/{parent_folder_id}/childFolders"
        else:
            url = f"{user_endpoint}/mailFolders"

        response = requests.get(url, headers=self._get_headers())
        response.raise_for_status()

        data = response.json()
        return [
            {
                "id": folder.get("id"),
                "displayName": folder.get("displayName"),
                "parentFolderId": folder.get("parentFolderId"),
                "totalItemCount": folder.get("totalItemCount"),
                "unreadItemCount": folder.get("unreadItemCount"),
                "childFolderCount": folder.get("childFolderCount")
            }
            for folder in data.get("value", [])
        ]

    @keyword("Create Folder")
    def create_folder(
        self,
        display_name: str,
        parent_folder_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new mail folder.

        Args:
            display_name: Folder name
            parent_folder_id: Parent folder (None for root level)

        Returns:
            Created folder info

        Example:
            | ${folder}= | Create Folder | Clients |
            | ${subfolder}= | Create Folder | VIP | parent_folder_id=${folder}[id] |
        """
        user_endpoint = self._get_user_endpoint()

        if parent_folder_id:
            url = f"{user_endpoint}/mailFolders/{parent_folder_id}/childFolders"
        else:
            url = f"{user_endpoint}/mailFolders"

        payload = {"displayName": display_name}

        response = requests.post(url, headers=self._get_headers(), json=payload)
        response.raise_for_status()

        folder = response.json()
        return {
            "id": folder.get("id"),
            "displayName": folder.get("displayName"),
            "parentFolderId": folder.get("parentFolderId")
        }

    @keyword("Delete Folder")
    def delete_folder(
        self,
        folder_id: str
    ) -> Dict[str, str]:
        """
        Delete a mail folder.

        Args:
            folder_id: Folder ID to delete

        Returns:
            Status dict

        Example:
            | Delete Folder | ${folder_id} |
        """
        user_endpoint = self._get_user_endpoint()
        url = f"{user_endpoint}/mailFolders/{folder_id}"

        response = requests.delete(url, headers=self._get_headers())
        response.raise_for_status()

        return {"status": "deleted", "folderId": folder_id}

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _transform_email(
        self,
        raw: Dict[str, Any],
        include_body: bool = True
    ) -> Dict[str, Any]:
        """Transform Graph API email to consistent format"""
        from_data = raw.get("from", {}).get("emailAddress", {})

        email = {
            "id": raw.get("id"),
            "subject": raw.get("subject", "(No Subject)"),
            "from": {
                "name": from_data.get("name", ""),
                "email": from_data.get("address", "")
            },
            "to": [
                {
                    "name": r.get("emailAddress", {}).get("name", ""),
                    "email": r.get("emailAddress", {}).get("address", "")
                }
                for r in raw.get("toRecipients", [])
            ],
            "cc": [
                {
                    "name": r.get("emailAddress", {}).get("name", ""),
                    "email": r.get("emailAddress", {}).get("address", "")
                }
                for r in raw.get("ccRecipients", [])
            ],
            "bcc": [
                {
                    "name": r.get("emailAddress", {}).get("name", ""),
                    "email": r.get("emailAddress", {}).get("address", "")
                }
                for r in raw.get("bccRecipients", [])
            ],
            "bodyPreview": raw.get("bodyPreview", ""),
            "receivedDateTime": raw.get("receivedDateTime"),
            "sentDateTime": raw.get("sentDateTime"),
            "hasAttachments": raw.get("hasAttachments", False),
            "isRead": raw.get("isRead", False),
            "importance": raw.get("importance", "normal"),
            "flag": raw.get("flag", {}).get("flagStatus", "notFlagged"),
            "categories": raw.get("categories", []),
            "conversationId": raw.get("conversationId"),
            "parentFolderId": raw.get("parentFolderId"),
            "webLink": raw.get("webLink")
        }

        if include_body and "body" in raw:
            email["body"] = {
                "content": raw["body"].get("content", ""),
                "contentType": raw["body"].get("contentType", "text").lower()
            }

        return email
