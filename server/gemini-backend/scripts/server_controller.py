import subprocess
import sys
import os

def run_menu(command=None):
    try:
        menu_path = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server_menu.bat'))
        
        # Batch files need cmd to execute; `cmd /c` with an argument list keeps every value a
        # separate argument (shell=False) instead of building one shell-parsed string.
        if command:
            # Run with specific command (e.g., 'stop')
            subprocess.run(["cmd", "/c", menu_path, command], shell=False, check=True)
        else:
            # Run the menu without command
            subprocess.run(["cmd", "/c", menu_path], shell=False, check=True)
            
    except subprocess.CalledProcessError as e:
        print(f"Error running menu: {e}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        run_menu(sys.argv[1])
    else:
        run_menu() 