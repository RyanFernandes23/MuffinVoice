# src/api/routers/notes.py
from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select
from typing import Optional

from src.api.deps import clerk_auth, logger
from src.api.schema import Notebook, Note
from src.api.utils import get_session

notes_router = APIRouter(prefix="/notes", tags=["notes"])


@notes_router.post("/{user_id}/{job_id}")
async def create_note(
    user_id: str,
    job_id: str,
    timestamp: float,
    user_note: str,
    subtitle_text: Optional[str] = None,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Create a new note for a specific job/voice.
    """
    if token_payload.decoded.get("sub") != user_id:
        raise HTTPException(
            status_code=403, detail="You do not have permission to perform this action."
        )

    try:
        # Verify the job exists and belongs to the user
        statement = select(Notebook).where(
            Notebook.job_id == job_id, Notebook.user_id == user_id
        )
        notebook = session.exec(statement).first()

        if not notebook:
            raise HTTPException(status_code=404, detail="Job not found")

        # Create the note
        note = Note(
            user_id=user_id,
            job_id=job_id,
            timestamp=timestamp,
            user_note=user_note,
            subtitle_text=subtitle_text,
        )

        session.add(note)
        session.commit()
        session.refresh(note)

        logger.info(f"Created note {note.id} for job {job_id}")

        return {
            "id": note.id,
            "timestamp": note.timestamp,
            "userNote": note.user_note,
            "subtitleText": note.subtitle_text,
            "createdAt": note.created_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating note for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Error creating note")


@notes_router.get("/{user_id}/{job_id}")
async def get_notes(
    user_id: str,
    job_id: str,
    search: Optional[str] = None,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Get all notes for a specific job. Optionally filter by search term.
    """
    if token_payload.decoded.get("sub") != user_id:
        raise HTTPException(
            status_code=403, detail="You do not have permission to perform this action."
        )

    try:
        # Verify the job exists and belongs to the user
        statement = select(Notebook).where(
            Notebook.job_id == job_id, Notebook.user_id == user_id
        )
        notebook = session.exec(statement).first()

        if not notebook:
            raise HTTPException(status_code=404, detail="Job not found")

        # Get notes, optionally filtered by search
        statement = select(Note).where(Note.job_id == job_id, Note.user_id == user_id)

        # TODO: Implement search functionality after fixing redis client

        # Order by timestamp
        notes = session.exec(statement).all()
        notes = sorted(notes, key=lambda note: note.timestamp)
        # Re-execute or re-sort is confusing here, keeping the simpler approach from original code for now
        notes = session.exec(statement).all()

        return {
            "notes": [
                {
                    "id": note.id,
                    "timestamp": note.timestamp,
                    "userNote": note.user_note,
                    "subtitleText": note.subtitle_text,
                    "createdAt": note.created_at.isoformat(),
                    "updatedAt": note.updated_at.isoformat(),
                }
                for note in notes
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching notes for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Error fetching notes")


@notes_router.put("/{user_id}/{job_id}/{note_id}")
async def update_note(
    user_id: str,
    job_id: str,
    note_id: str,
    user_note: Optional[str] = None,
    subtitle_text: Optional[str] = None,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Update an existing note.
    """
    from datetime import datetime, timezone  # Needed for updated_at

    if token_payload.decoded.get("sub") != user_id:
        raise HTTPException(
            status_code=403, detail="You do not have permission to perform this action."
        )

    try:
        # Verify the job exists and belongs to the user
        statement = select(Notebook).where(
            Notebook.job_id == job_id, Notebook.user_id == user_id
        )
        notebook = session.exec(statement).first()

        if not notebook:
            raise HTTPException(status_code=404, detail="Job not found")

        # Find the note
        statement = select(Note).where(
            Note.id == note_id, Note.job_id == job_id, Note.user_id == user_id
        )
        note = session.exec(statement).first()

        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        # Update fields
        if user_note is not None:
            note.user_note = user_note
        if subtitle_text is not None:
            note.subtitle_text = subtitle_text

        note.updated_at = datetime.now(timezone.utc)

        session.add(note)
        session.commit()
        session.refresh(note)

        logger.info(f"Updated note {note_id}")

        return {
            "id": note.id,
            "timestamp": note.timestamp,
            "userNote": note.user_note,
            "subtitleText": note.subtitle_text,
            "createdAt": note.created_at.isoformat(),
            "updatedAt": note.updated_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating note {note_id}: {e}")
        raise HTTPException(status_code=500, detail="Error updating note")


@notes_router.delete("/{user_id}/{job_id}/{note_id}")
async def delete_note(
    user_id: str,
    job_id: str,
    note_id: str,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Delete a note.
    """
    if token_payload.decoded.get("sub") != user_id:
        raise HTTPException(
            status_code=403, detail="You do not have permission to perform this action."
        )

    try:
        # Verify the job exists and belongs to the user
        statement = select(Notebook).where(
            Notebook.job_id == job_id, Notebook.user_id == user_id
        )
        notebook = session.exec(statement).first()

        if not notebook:
            raise HTTPException(status_code=404, detail="Job not found")

        # Find the note
        statement = select(Note).where(
            Note.id == note_id, Note.job_id == job_id, Note.user_id == user_id
        )
        note = session.exec(statement).first()

        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        session.delete(note)
        session.commit()

        logger.info(f"Deleted note {note_id}")

        return {"message": "Note deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting note {note_id}: {e}")
        raise HTTPException(status_code=500, detail="Error deleting note")


@notes_router.get("_count/{user_id}/{job_id}")
async def get_notes_count(
    user_id: str,
    job_id: str,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Get the count of notes for a specific job.
    """
    if token_payload.decoded.get("sub") != user_id:
        raise HTTPException(
            status_code=403, detail="You do not have permission to perform this action."
        )

    try:
        statement = select(Note).where(Note.job_id == job_id, Note.user_id == user_id)
        notes_count = len(session.exec(statement).all())

        return {"count": notes_count}

    except Exception as e:
        logger.error(f"Error getting notes count for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Error getting notes count")
