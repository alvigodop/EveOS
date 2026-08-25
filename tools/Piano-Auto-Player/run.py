import argparse

from app.server import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Piano Auto Player local service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8771)
    parser.add_argument("--no-browser", action="store_true", help="Compatibility flag for EveOS")
    args = parser.parse_args()
    run(host=args.host, port=args.port)
