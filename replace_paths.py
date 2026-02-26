import os

target_dir = r"C:\Users\alvin\Documents\Unidex File\Personal Projects Workstation\Tests-Unidex\Tests and Experiments\NewPageObservation\Workshop\js\modules\gemini"
old_str = "main_js_files/"
new_str = "js/modules/gemini/"

count = 0
for root, dirs, files in os.walk(target_dir):
    for file in files:
        if file.endswith(".js") or file.endswith(".css") or file.endswith(".html"):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if old_str in content:
                    print(f"Updating {path}")
                    new_content = content.replace(old_str, new_str)
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    count += 1
            except Exception as e:
                print(f"Error reading {path}: {e}")

print(f"Updated {count} files.")
