## pip install --upgrade google-genai==0.3.0 google-generativeai==0.8.3##

# Only import what we actually need for the entry point
from main_server_files.server_initialization.main_entry import run_main_server

if __name__ == "__main__":
    run_main_server()