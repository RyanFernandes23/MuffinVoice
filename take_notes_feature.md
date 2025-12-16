# Take Notes Feature - Design & Implementation Plan

## Design Proposal: Take Notes Feature

### Core Concept
Enable users to create **timestamped notes while listening** to their audiobook. Each note captures:
- The exact moment in the audio (timestamp)
- User's written note text
- The subtitle text at that moment (for context)
- Ability to review, edit, and jump back to that moment

---

## Key Design Ideas

### 1. Where Notes Are Triggered
- **Button in AudioPlayer**: A "📝 Notes" button next to Subtitles/Switch Voice
- **Quick Capture**: Click to open a small note-entry modal while audio keeps playing
- **From Subtitles**: Option to highlight subtitle text and create note from it (future enhancement)

### 2. Note Entry Interface
- **Simple modal** with:
  - Timestamp auto-captured (e.g., "2:34")
  - Subtitle context (read-only, showing what's playing)
  - Text input for user's note (free-form, ~200 chars suggested)
  - "Save Note" button (auto-saves on Enter key too)

### 3. Notes List Panel
- **Sidebar or expandable drawer** showing all notes for current notebook
- **Displays**:
  - Timestamp (clickable to seek there)
  - User's note preview (truncated)
  - Subtitle text snippet for context
  - Delete icon for each note
- **Scrollable list** if many notes
- **Search/filter capability** (find notes by keyword)

### 4. Data Storage

```
S3: user_id/job_id/notes.json
{
  "notes": [
    {
      "id": "uuid",
      "timestamp": 154.32,
      "userNote": "Important character introduction",
      "subtitleText": "The wizard walked into the room...",
      "createdAt": "2025-12-17T10:30:00Z"
    },
    ...
  ]
}
```

- Stored in **AWS S3** alongside other job artifacts (consistent with current structure)
- Synced to **PostgreSQL** for quick retrieval (notes metadata)

### 5. Workflow
1. User clicks "📝 Notes" button while listening
2. Modal pops up with current timestamp + subtitle text
3. User types note
4. Clicks "Save" → note stored to S3/DB
5. Notes list updates in sidebar
6. User clicks any note's timestamp → audio seeks to that moment
7. User can edit or delete notes anytime

### 6. UI Placement
- **Notes button** in AudioPlayer controls (next to Subtitles button)
- **Notes sidebar** toggles open/closed next to SubtitleWindow
- **Or integrated into SubtitleWindow** as a tabs: "Subtitles" | "My Notes"

---

## Implementation Options

### Option A: Lightweight (Start Here)
**Scope**: Basic note capture and playback
- Notes stored only in S3 (no DB changes)
- Simple in-memory state in AudioPlayer
- Minimal UI (just a button + floating modal)
- **Estimated time**: 3-4 hours

**Features**:
- Create notes with timestamp + text
- View notes list while playing
- Click note to seek to that moment
- Delete notes
- No persistence between sessions (unless manually saved)

**Components to create**:
- `NotesModal.jsx` - Note entry modal
- `NotesList.jsx` - Notes display sidebar
- Update `AudioPlayer.jsx` - Add notes button and state management

---

### Option B: Moderate (Recommended)
**Scope**: Full note management with persistence
- Notes stored in S3 + PostgreSQL metadata
- Notes sidebar panel in dashboard too (see all notes for a notebook)
- Edit/delete capabilities
- Search/filter notes by keyword
- **Estimated time**: 6-8 hours

**Features** (includes all of Option A plus):
- Persistent storage (S3 + DB)
- Edit existing notes
- Search notes by keyword
- View all notes for a notebook from dashboard
- Export notes list
- Sort by timestamp or date created
- Bulk delete notes

**Backend changes needed**:
- API endpoints:
  - `POST /notes/{userId}/{jobId}` - Create note
  - `GET /notes/{userId}/{jobId}` - Fetch all notes
  - `PUT /notes/{userId}/{jobId}/{noteId}` - Update note
  - `DELETE /notes/{userId}/{jobId}/{noteId}` - Delete note
  - `GET /notes/{userId}/{jobId}/search?q=keyword` - Search notes

**Database schema**:
```sql
CREATE TABLE notes (
  id UUID PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  job_id VARCHAR NOT NULL,
  timestamp FLOAT NOT NULL,
  user_note TEXT NOT NULL,
  subtitle_text TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  INDEX (user_id, job_id, timestamp)
);
```

**Components to create**:
- `NotesModal.jsx` - Note entry/edit modal
- `NotesList.jsx` - Notes display sidebar
- `NotesPanel.jsx` - Full notes management panel for dashboard
- Update `AudioPlayer.jsx` - Notes button and state
- Update dashboard to show notes count per notebook

---

### Option C: Full-Featured (Future)
**Scope**: Advanced annotation system with sharing and export
- Add to Option B: highlight/bookmark subtitles
- Note templates (bookmark, question, summary, etc.)
- Export notes as PDF/Markdown
- Share notes with others
- **Estimated time**: 2-3 weeks

**Additional features**:
- Note types/tags (bookmark, question, important, summary, etc.)
- Highlight subtitle text with color coding
- Note tagging system
- Collaborative notes (share with friends)
- Export entire session notes as PDF/Markdown
- Print notes with audio timestamp references

---

## Current App Architecture Context

### Related Components
- **AudioPlayer** (`app/components/AudioPlayer.jsx`)
  - Manages audio playback and timing
  - Has access to `currentTime`, `duration`, `selectedVoice`
  - Ideal place to trigger note capture

- **SubtitleWindow** (`app/components/SubtitleWindow.jsx`)
  - Displays current subtitle text
  - Already syncs with audio playback
  - Could be extended to show notes alongside

- **NotebookCard** (`app/components/NotebookCard.jsx`)
  - Dashboard notebook display
  - Could show notes count badge

### Data Flow
- **Frontend → Backend**: POST note with timestamp, text, subtitles
- **Backend → S3**: Store notes.json in user_id/job_id/
- **Backend → PostgreSQL**: Store note metadata for quick queries
- **Frontend ← Backend**: GET notes for display, with pagination

### Storage Strategy
Following existing app pattern:
- S3: `{userId}/{jobId}/notes.json` - Full note objects
- PostgreSQL: `notes` table - Metadata + quick lookups
- Redis: Optional - Cache hot notes for active listeners

---

## Recommended Next Steps

1. **Decide on scope**: Choose between Options A, B, or C
2. **Create components** (NotesList, NotesModal)
3. **Add API endpoints** in backend
4. **Implement S3 storage** for notes.json
5. **Update AudioPlayer** to integrate notes functionality
6. **Test timestamp accuracy** and seek behavior
7. **Add notes UI to dashboard** (for Option B+)

---

## Design Considerations

### UX Best Practices
- **Auto-save on blur** - Don't make users click save explicitly
- **Keyboard shortcuts** - Ctrl+M or Cmd+M to toggle note modal
- **Visual feedback** - Highlight notes taken in subtitle timeline
- **Batch operations** - Select multiple notes to delete/export
- **Undo capability** - Allow undo for deleted notes (soft delete first)

### Performance
- **Lazy load notes** - Only fetch when panel opens
- **Pagination** - Load notes in batches (e.g., 20 at a time)
- **Search debouncing** - Wait 300ms after user stops typing
- **Caching** - Cache notes in-memory during session

### Accessibility
- **Keyboard navigation** - Tab through notes list, Enter to seek
- **Screen reader support** - Proper ARIA labels for buttons/modals
- **Color contrast** - Ensure notes panel has good contrast
- **Focus management** - Return focus after note saved

---

## Questions for Refinement

1. **Max note length?** (e.g., 500 chars, unlimited?)
2. **Note types?** (Simple text, templates, tags?)
3. **Sharing capability?** (Private, shareable link, collaborative?)
4. **Export format?** (Markdown, PDF, plain text?)
5. **Mobile support?** (Responsive design for mobile listening?)
6. **Archiving old notebooks?** (Archive notes too, or keep separately?)
7. **Note visibility?** (Private to user, shareable with study groups?)
8. **Integration with subtitles?** (Click subtitle to auto-create note?)
