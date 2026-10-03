from fastapi import FastAPI
from workers import asgi


app = FastAPI(title="Game List API")


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from Cloudflare Workers!"}


Default = asgi.entrypoint(app)
