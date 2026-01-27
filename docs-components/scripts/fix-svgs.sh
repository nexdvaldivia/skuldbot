#!/bin/bash
# Script to replace all inline SVGs with Lucide icon names

DOCS_DIR="src/app/components"

# Create sed script for each file
fix_file() {
    local file=$1
    echo "Processing: $file"
    
    # Use perl for multi-line regex replacement
    perl -i -0pe '
        # Replace SVG blocks with icon names based on the icon class
        s/<NodeHeader\s+id="([^"]+)"\s+icon=\{`\s*<svg[^>]*class="lucide\s+lucide-([^"]+)"[^>]*>[\s\S]*?<\/svg>\s*`\}\s+label="([^"]+)"\s+description="([^"]+)"\s+bgColor="([^"]+)"\s+textColor="([^"]+)"\s*\/>/<NodeHeader id="$1" icon="ICON_$2" label="$3" description="$4" bgColor="$5" textColor="$6" \/>/g;
    ' "$file"
    
    # Convert lucide kebab-case to PascalCase
    # globe -> Globe
    # external-link -> ExternalLink
    # mouse-pointer-2 -> MousePointer2
    sed -i '' '
        s/icon="ICON_globe"/icon="Globe"/g
        s/icon="ICON_external-link"/icon="ExternalLink"/g
        s/icon="ICON_mouse-pointer-2"/icon="MousePointer2"/g
        s/icon="ICON_type"/icon="Type"/g
        s/icon="ICON_chevron-down"/icon="ChevronDown"/g
        s/icon="ICON_text-cursor"/icon="TextCursor"/g
        s/icon="ICON_tag"/icon="Tag"/g
        s/icon="ICON_camera"/icon="Camera"/g
        s/icon="ICON_clock"/icon="Clock"/g
        s/icon="ICON_code"/icon="Code"/g
        s/icon="ICON_arrow-down"/icon="ArrowDown"/g
        s/icon="ICON_circle-alert"/icon="AlertCircle"/g
        s/icon="ICON_panel-left"/icon="PanelLeft"/g
        s/icon="ICON_x"/icon="X"/g
        s/icon="ICON_download"/icon="Download"/g
        s/icon="ICON_app-window"/icon="AppWindow"/g
        s/icon="ICON_mouse-pointer"/icon="MousePointer"/g
        s/icon="ICON_keyboard"/icon="Keyboard"/g
        s/icon="ICON_command"/icon="Command"/g
        s/icon="ICON_square"/icon="Square"/g
        s/icon="ICON_minus"/icon="Minus"/g
        s/icon="ICON_maximize-2"/icon="Maximize2"/g
        s/icon="ICON_x-square"/icon="XSquare"/g
        s/icon="ICON_monitor"/icon="Monitor"/g
        s/icon="ICON_image"/icon="Image"/g
        s/icon="ICON_scan-search"/icon="ScanSearch"/g
        s/icon="ICON_copy"/icon="Copy"/g
        s/icon="ICON_database"/icon="Database"/g
        s/icon="ICON_arrow-left-right"/icon="ArrowLeftRight"/g
        s/icon="ICON_refresh-cw"/icon="RefreshCw"/g
        s/icon="ICON_file-input"/icon="FileInput"/g
        s/icon="ICON_file-output"/icon="FileOutput"/g
        s/icon="ICON_folder-input"/icon="FolderInput"/g
        s/icon="ICON_trash-2"/icon="Trash2"/g
        s/icon="ICON_folder-plus"/icon="FolderPlus"/g
        s/icon="ICON_folder-open"/icon="FolderOpen"/g
        s/icon="ICON_file-search"/icon="FileSearch"/g
        s/icon="ICON_file-text"/icon="FileText"/g
        s/icon="ICON_archive"/icon="Archive"/g
        s/icon="ICON_folder-archive"/icon="FolderArchive"/g
        s/icon="ICON_eye"/icon="Eye"/g
        s/icon="ICON_link"/icon="Link"/g
        s/icon="ICON_file-spreadsheet"/icon="FileSpreadsheet"/g
        s/icon="ICON_table"/icon="Table"/g
        s/icon="ICON_table-2"/icon="Table2"/g
        s/icon="ICON_square-stack"/icon="SquareStack"/g
        s/icon="ICON_pen-line"/icon="PenLine"/g
        s/icon="ICON_list-plus"/icon="ListPlus"/g
        s/icon="ICON_filter"/icon="Filter"/g
        s/icon="ICON_save"/icon="Save"/g
        s/icon="ICON_pie-chart"/icon="PieChart"/g
        s/icon="ICON_file-plus-2"/icon="FilePlus2"/g
        s/icon="ICON_plus"/icon="Plus"/g
        s/icon="ICON_edit-3"/icon="Edit3"/g
        s/icon="ICON_layers"/icon="Layers"/g
        s/icon="ICON_rows-icon"/icon="RowsIcon"/g
        s/icon="ICON_columns"/icon="Columns"/g
        s/icon="ICON_paint-bucket"/icon="PaintBucket"/g
        s/icon="ICON_merge"/icon="Merge"/g
        s/icon="ICON_arrow-up-down"/icon="ArrowUpDown"/g
        s/icon="ICON_search-code"/icon="SearchCode"/g
        s/icon="ICON_line-chart"/icon="LineChart"/g
        s/icon="ICON_file-down"/icon="FileDown"/g
        s/icon="ICON_search"/icon="Search"/g
        s/icon="ICON_send"/icon="Send"/g
        s/icon="ICON_mail-open"/icon="MailOpen"/g
        s/icon="ICON_reply"/icon="Reply"/g
        s/icon="ICON_forward"/icon="Forward"/g
        s/icon="ICON_paperclip"/icon="Paperclip"/g
        s/icon="ICON_check-circle"/icon="CheckCircle"/g
        s/icon="ICON_inbox"/icon="Inbox"/g
        s/icon="ICON_file-edit"/icon="FileEdit"/g
        s/icon="ICON_folders"/icon="Folders"/g
        s/icon="ICON_files"/icon="Files"/g
        s/icon="ICON_scissors"/icon="Scissors"/g
        s/icon="ICON_scan-text"/icon="ScanText"/g
        s/icon="ICON_clipboard-pen"/icon="ClipboardPen"/g
        s/icon="ICON_git-branch"/icon="GitBranch"/g
        s/icon="ICON_check"/icon="Check"/g
        s/icon="ICON_git-graph"/icon="GitGraph"/g
        s/icon="ICON_upload"/icon="Upload"/g
        s/icon="ICON_file-code"/icon="FileCode"/g
        s/icon="ICON_key"/icon="Key"/g
        s/icon="ICON_braces"/icon="Braces"/g
        s/icon="ICON_bot"/icon="Bot"/g
        s/icon="ICON_tags"/icon="Tags"/g
        s/icon="ICON_languages"/icon="Languages"/g
        s/icon="ICON_heart"/icon="Heart"/g
        s/icon="ICON_wrench"/icon="Wrench"/g
        s/icon="ICON_lightbulb"/icon="Lightbulb"/g
        s/icon="ICON_binary"/icon="Binary"/g
        s/icon="ICON_cpu"/icon="Cpu"/g
        s/icon="ICON_route"/icon="Route"/g
        s/icon="ICON_repeat"/icon="Repeat"/g
        s/icon="ICON_variable"/icon="Variable"/g
        s/icon="ICON_shield-alert"/icon="ShieldAlert"/g
        s/icon="ICON_stop-circle"/icon="StopCircle"/g
        s/icon="ICON_corner-right-down"/icon="CornerRightDown"/g
        s/icon="ICON_shuffle"/icon="Shuffle"/g
        s/icon="ICON_combine"/icon="Combine"/g
        s/icon="ICON_terminal"/icon="Terminal"/g
        s/icon="ICON_package"/icon="Package"/g
        s/icon="ICON_folder-code"/icon="FolderCode"/g
        s/icon="ICON_book-open"/icon="BookOpen"/g
        s/icon="ICON_play"/icon="Play"/g
        s/icon="ICON_arrow-down-to-line"/icon="ArrowDownToLine"/g
        s/icon="ICON_arrow-up-from-line"/icon="ArrowUpFromLine"/g
        s/icon="ICON_list-ordered"/icon="ListOrdered"/g
        s/icon="ICON_shield-check"/icon="ShieldCheck"/g
        s/icon="ICON_shield-plus"/icon="ShieldPlus"/g
        s/icon="ICON_clipboard-list"/icon="ClipboardList"/g
        s/icon="ICON_bar-chart"/icon="BarChart"/g
        s/icon="ICON_file-bar-chart"/icon="FileBarChart"/g
        s/icon="ICON_user-check"/icon="UserCheck"/g
        s/icon="ICON_message-square"/icon="MessageSquare"/g
        s/icon="ICON_alert-triangle"/icon="AlertTriangle"/g
        s/icon="ICON_bell"/icon="Bell"/g
        s/icon="ICON_activity"/icon="Activity"/g
        s/icon="ICON_timer"/icon="Timer"/g
        s/icon="ICON_timer-off"/icon="TimerOff"/g
        s/icon="ICON_lock"/icon="Lock"/g
        s/icon="ICON_unlock"/icon="Unlock"/g
        s/icon="ICON_hash"/icon="Hash"/g
        s/icon="ICON_eye-off"/icon="EyeOff"/g
        s/icon="ICON_phone"/icon="Phone"/g
        s/icon="ICON_phone-call"/icon="PhoneCall"/g
        s/icon="ICON_phone-off"/icon="PhoneOff"/g
        s/icon="ICON_volume-2"/icon="Volume2"/g
        s/icon="ICON_mic"/icon="Mic"/g
        s/icon="ICON_audio-lines"/icon="AudioLines"/g
        s/icon="ICON_phone-forwarded"/icon="PhoneForwarded"/g
        s/icon="ICON_users"/icon="Users"/g
        s/icon="ICON_mail"/icon="Mail"/g
        s/icon="ICON_flag"/icon="Flag"/g
        s/icon="ICON_alert-circle"/icon="AlertCircle"/g
        s/icon="ICON_folder-minus"/icon="FolderMinus"/g
        s/icon="ICON_snowflake"/icon="Snowflake"/g
        s/icon="ICON_cloud"/icon="Cloud"/g
        s/icon="ICON_hexagon"/icon="Hexagon"/g
        s/icon="ICON_credit-card"/icon="CreditCard"/g
        s/icon="ICON_hard-drive"/icon="HardDrive"/g
        s/icon="ICON_server"/icon="Server"/g
    ' "$file"
}

# Process all component pages
for file in $DOCS_DIR/*/page.mdx; do
    if grep -q 'icon={`' "$file" 2>/dev/null; then
        fix_file "$file"
    fi
done

echo "Done!"


