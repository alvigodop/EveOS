import subprocess
import sys
import os

def run_menu(command=None):
    try:
        menu_path = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server_menu.bat'))
        
        if command:
            # Run with specific command (e.g., 'stop')
            subprocess.run([menu_path, command], shell=True, check=True)
        else:
            # Run the menu without command
            subprocess.run([menu_path], shell=True, check=True)
            
    except subprocess.CalledProcessError as e:
        print(f"Error running menu: {e}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        run_menu(sys.argv[1])
    else:
        run_menu() 