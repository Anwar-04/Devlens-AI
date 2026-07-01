from fastapi import FastAPI
from pydantic import BaseModel


class HealthResponse(BaseModel):
    service: str
    status: str
    version: str


class AskRequest(BaseModel):
    repository_id: str
    question: str
    level: str = "intermediate"


app = FastAPI(
    title="DevLens AI Service",
    description="Agentic RAG and repository intelligence service.",
    version="0.1.0",
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(service="devlens-ai-service", status="ok", version="0.1.0")


@app.post("/agents/ask")
def ask_repository(request: AskRequest) -> dict[str, object]:
    return {
        "repositoryId": request.repository_id,
        "answer": "Agent orchestration scaffold is ready. Retrieval will be added in Milestone 4.",
        "level": request.level,
        "citations": [],
    }

