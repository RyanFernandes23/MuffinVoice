from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from src.api.deps import clerk_auth
from src.api.token_utils import get_user_tokens
from src.api.utils import get_session

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("")
async def get_usage(
    token_payload=Depends(clerk_auth), session: Session = Depends(get_session)
):
    """
    Get current token usage status for the authenticated user.
    Returns remaining tokens, allocated tokens, used this month, and percentage used.
    """
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    try:
        usage_data = get_user_tokens(user_id, session)
        return {"success": True, "data": usage_data}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get usage: {str(e)}")
