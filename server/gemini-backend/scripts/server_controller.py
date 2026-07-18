import subprocess
import sys
from pathlib import Path

def run_menu(command=None):
    try:
        project_root = Path(__file__).resolve().parents[3]
        menu_path = project_root / 'tools' / 'batch' / 'server-menu.bat'
        if not menu_path.is_file():
            raise FileNotFoundError(f"Canonical Gemini menu not found: {menu_path}")
        
        # Batch files need cmd to execute; `cmd /c` with an argument list keeps every value a
        # separate argument (shell=False) instead of building one shell-parsed string.
        if command:
            # Run with specific command (e.g., 'stop')
            subprocess.run(["cmd", "/c", str(menu_path), command], shell=False, check=True)
        else:
            # Run the menu without command
            subprocess.run(["cmd", "/c", str(menu_path)], shell=False, check=True)
            
    except subprocess.CalledProcessError as e:
        print(f"Error running menu: {e}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        run_menu(sys.argv[1])
    else:
        run_menu()
