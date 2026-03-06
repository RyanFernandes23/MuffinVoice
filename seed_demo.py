import os
import sys
from sqlmodel import Session, select
from src.api.schema import Notebook
from src.api.utils import engine

def mark_notebook_as_public(identifier: str):
    with Session(engine) as session:
        # Try finding by job_id first
        statement = select(Notebook).where(Notebook.job_id == identifier)
        notebook = session.exec(statement).first()
        
        if not notebook:
            # Try finding by title
            statement = select(Notebook).where(Notebook.title == identifier)
            notebook = session.exec(statement).first()
            
        if not notebook:
            print(f"Notebook with ID or Title '{identifier}' not found.")
            return

        notebook.is_public = True
        session.add(notebook)
        session.commit()
        print(f"Successfully marked '{notebook.title}' (job_id: {notebook.job_id}) as PUBLIC.")

def list_notebooks():
    with Session(engine) as session:
        statement = select(Notebook)
        notebooks = session.exec(statement).all()
        print("\nExisting Notebooks:")
        print(f"{'Title':<30} | {'Status':<15} | {'Public':<6} | {'Job ID'}")
        print("-" * 80)
        for nb in notebooks:
            print(f"{nb.title:<30} | {nb.status:<15} | {str(nb.is_public):<6} | {nb.job_id}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        mark_notebook_as_public(sys.argv[1])
    else:
        list_notebooks()
        print("\nUsage: python seed_demo.py <job_id_or_title>")
