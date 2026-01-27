# AI Planner V2 - Testing Guide

## Overview
This guide covers testing the AI Planner V2 implementation, which generates truly executable and production-ready automation workflows with validation.

## Prerequisites
- SkuldBot Studio installed
- SkuldAI license activated (or test mode enabled)
- LLM connection configured (OpenAI, Anthropic, or local)

## Test Environment Setup

### 1. Configure LLM Connection
1. Open Studio
2. Click AI Planner button (or press `Cmd+Shift+P`)
3. Click Settings icon
4. Click "New Connection"
5. Configure:
   - **Provider**: OpenAI (recommended for initial testing)
   - **API Key**: Your OpenAI API key
   - **Model**: gpt-4o (recommended)
   - **Temperature**: 0.7

### 2. Verify Backend is Ready
```bash
cd studio/src-tauri
cargo build --release
```

## Test Cases

### Test Case 1: Simple Email Automation
**Goal**: Test basic workflow generation with standard nodes

**Steps**:
1. Open AI Planner V2 panel
2. In Chat tab, enter:
   ```
   Download invoices from Gmail and save to S3
   ```
3. Click "Send" or press `Cmd+Enter`

**Expected Result**:
- AI generates 4-6 step workflow
- Steps include:
  - `trigger.manual` (start)
  - `email.gmail_connect` or similar
  - `email.search` with appropriate query
  - `email.extract_attachments`
  - `cloud.s3_upload` or `storage.upload`
  - `control.log` (completion)
- Confidence: >= 0.8
- Validation: Valid & Compilable
- No errors in Validation tab

**Preview Tab Verification**:
- All steps show green checkmarks
- Config values use `${VARIABLE_NAME}` placeholders
- Proper connections between nodes

**Validation Tab Verification**:
- All checks pass
- Production Ready badge visible
- 0 errors

---

### Test Case 2: AI Agent with RAG
**Goal**: Test complex AI workflow with proper node connections

**Steps**:
1. Open AI Planner V2 panel
2. In Chat tab, enter:
   ```
   Create a RAG chatbot that:
   - Loads documents from a folder
   - Splits them into chunks
   - Creates embeddings with OpenAI
   - Stores in ChromaDB
   - Answers user questions using the knowledge base
   - Includes PII detection
   ```
3. Send request

**Expected Result**:
- AI generates 8-12 step workflow
- Includes:
  - `trigger.manual`
  - `files.list_directory` or `files.read`
  - `ai.text_splitter`
  - `ai.embeddings` (OpenAI)
  - `vectordb.chromadb_insert`
  - `ai.model` (config node)
  - `ai.agent` with proper connections:
    - `model_config` port → `ai.model`
    - `embeddings` port → `ai.embeddings`
    - `memory` port → `vectordb.memory`
  - `ai.pii_detection`
- Confidence: >= 0.7
- Validation: Valid & Compilable

**Refinement Test**:
1. After generation, enter:
   ```
   Use Claude 3.5 Sonnet instead of GPT-4
   ```
2. Verify AI updates `ai.model` config
3. Enter:
   ```
   Add error handling for failed API calls
   ```
4. Verify AI adds `outputs.error` handlers

---

### Test Case 3: Web Scraping with Scheduling
**Goal**: Test trigger nodes and scheduling

**Steps**:
1. In Chat tab, enter:
   ```
   Scrape product prices from Amazon daily at 2 AM and update a Google Sheet
   ```
2. Send request

**Expected Result**:
- Workflow starts with `trigger.schedule` (not manual)
- Schedule config: cron expression for 2 AM daily
- Steps include:
  - `trigger.schedule`
  - `web.open_browser`
  - `web.navigate`
  - `web.extract_table` or `web.scrape`
  - `spreadsheet.google_sheets_update`
  - Error handling nodes
- Confidence: >= 0.75
- Validation: Valid & Compilable

---

### Test Case 4: Data Pipeline with Transformation
**Goal**: Test data connectors and transformation nodes

**Steps**:
1. In Chat tab, enter:
   ```
   Extract data from SQL Server, transform it (remove duplicates, filter nulls), and load into Snowflake
   ```
2. Send request

**Expected Result**:
- Workflow includes:
  - `trigger.manual` or `trigger.schedule`
  - `data.sqlserver_tap` (source)
  - `data.transform` with deduplication
  - `data.transform` with null filtering
  - `data.snowflake_target` (destination)
- Proper `control.map` usage if iterating
- Confidence: >= 0.7
- Validation: Valid & Compilable

---

### Test Case 5: Clarification Handling
**Goal**: Test AI's ability to ask clarifying questions

**Steps**:
1. In Chat tab, enter vague request:
   ```
   Process some files
   ```
2. Send request

**Expected Result**:
- AI responds with clarifying questions:
  - "What type of files do you want to process?"
  - "What processing should be done?"
  - "Where are the files located?"
  - "What should happen with the results?"
- No workflow generated yet
- User can answer questions to refine

**Answer Questions**:
3. Enter:
   ```
   CSV files in /data/input
   Validate data and remove duplicates
   Save to /data/output
   ```
4. Send request

**Expected Result**:
- AI now generates complete workflow
- Confidence: >= 0.8

---

### Test Case 6: Error Handling
**Goal**: Test validation catches errors

**Steps**:
1. Manually edit Rust code to simulate invalid DSL
2. Or test with intentionally broken request:
   ```
   Use a fake node type called "magic.do_everything"
   ```

**Expected Result**:
- Validation tab shows errors
- Error: "Unknown node type: magic.do_everything"
- Not compilable
- Cannot apply to canvas
- Confidence: < 0.4

---

### Test Case 7: Iteration Limit
**Goal**: Test max iterations protection

**Steps**:
1. Generate a workflow
2. Refine 5 times with minor changes:
   - "Change log level to DEBUG"
   - "Add another log"
   - "Change variable name"
   - "Add comment"
   - "Add another log"
3. Try 6th refinement

**Expected Result**:
- Toast error: "Maximum refinement iterations reached"
- Cannot refine further
- User must start new plan

---

### Test Case 8: Apply to Canvas
**Goal**: Test workflow application to canvas

**Steps**:
1. Generate any valid workflow (use Test Case 1)
2. Switch to Preview tab
3. Click "Apply to Canvas"

**Expected Result**:
- Panel closes
- Nodes appear on canvas
- Nodes are properly positioned (vertical layout)
- Edges connect nodes
- Config values visible in node panels
- Bot info updated with workflow name/description

---

### Test Case 9: Export DSL
**Goal**: Test DSL export functionality

**Steps**:
1. Generate any valid workflow
2. Switch to Preview tab
3. Click "Export DSL"

**Expected Result**:
- Browser downloads JSON file
- Filename: `{goal-name}.json` (kebab-case)
- Valid JSON format
- Contains complete DSL structure
- Can be imported into Studio

---

### Test Case 10: Keyboard Shortcuts
**Goal**: Test keyboard navigation

**Steps**:
1. Open AI Planner V2 panel
2. Press `Cmd+1` → Chat tab activates
3. Press `Cmd+2` → Preview tab activates
4. Press `Cmd+3` → Validation tab activates
5. In Chat tab, type message
6. Press `Cmd+Enter` → Message sends
7. Press `Escape` → Panel closes

**Expected Result**:
- All shortcuts work as expected
- Tab switches are instant
- No focus issues

---

## Integration Tests

### Integration Test 1: Full Workflow Execution
1. Generate workflow with Test Case 1
2. Apply to canvas
3. Configure credentials:
   - Add Gmail OAuth credentials to vault
   - Add AWS credentials for S3
4. Click "Run Bot"
5. Verify execution:
   - Bot starts without errors
   - Logs show each step
   - Files are uploaded to S3
   - Bot completes successfully

### Integration Test 2: Version History
1. Generate workflow
2. Apply to canvas
3. Save bot
4. Modify workflow manually
5. Save new version
6. Check version history
7. Verify AI-generated version is saved

---

## Performance Tests

### Performance Test 1: Response Time
- Generate 10 workflows with varying complexity
- Measure time from "Send" to response
- Expected: < 30 seconds for simple, < 60 seconds for complex

### Performance Test 2: Validation Speed
- Test validation on workflows with 3, 6, 10, 15 nodes
- Expected: < 2 seconds for all sizes

---

## Edge Cases

### Edge Case 1: Empty Input
- Input: "" (empty string)
- Expected: Warning toast "Please describe what you want to automate"

### Edge Case 2: Very Long Description
- Input: 2000+ word detailed description
- Expected: AI generates plan, might ask to simplify

### Edge Case 3: Unsupported Feature Request
- Input: "Control my smart home devices"
- Expected: AI explains limitation or suggests alternative

### Edge Case 4: Multiple Workflows in One Request
- Input: "Create a workflow for emails AND a workflow for scraping"
- Expected: AI asks to split into separate requests

---

## Bug Reporting Template

If you find issues, report with:
```markdown
## Bug Report

**Test Case**: [Test Case Number/Name]
**Environment**:
- OS: macOS 14.6
- Studio Version: 0.1.0
- LLM Provider: OpenAI / Anthropic / Local
- LLM Model: gpt-4o

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [...]

**Expected Result**:
[What should happen]

**Actual Result**:
[What actually happened]

**Screenshots/Logs**:
[Attach if applicable]

**Error Messages**:
```
[Paste error messages or console logs]
```

**Additional Context**:
[Any other relevant information]
```

---

## Success Criteria

The AI Planner V2 is considered successful if:

✅ **Generation**:
- Generates valid workflows for 90%+ of standard use cases
- Confidence >= 0.8 for clear requests
- Confidence >= 0.6 for complex requests
- Asks clarifying questions for vague requests

✅ **Validation**:
- Catches all critical errors (missing start node, invalid types, unreachable nodes)
- Warns about missing error handling
- Compilable flag matches actual compilation result

✅ **Refinement**:
- Successfully refines workflows based on user feedback
- Maintains context across iterations
- Doesn't break working workflows during refinement

✅ **User Experience**:
- Response time < 60 seconds
- UI remains responsive during generation
- Clear error messages
- Intuitive navigation

✅ **Integration**:
- Generated workflows run successfully on SkuldBot Runners
- DSL export/import works correctly
- Proper integration with Studio canvas

---

## Next Steps

After testing:
1. Document any issues found
2. Prioritize fixes (critical → high → medium → low)
3. Implement fixes
4. Re-test
5. Prepare for production release

---

## Contact

For questions or issues, contact the development team or create an issue in the repository.

