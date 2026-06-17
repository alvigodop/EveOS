import os
import json

manifest_path = r"C:\Users\alvin\Documents\Unidex File\Personal Projects Workstation\Tests-Unidex\Tests and Experiments\NewPageObservation\Workshop\js\config\manifest.js"
css_root = r"C:\Users\alvin\Documents\Unidex File\Personal Projects Workstation\Tests-Unidex\Tests and Experiments\NewPageObservation\Workshop\css\modules\gemini"

# 1. Gather CSS files
css_files = []
for root, dirs, files in os.walk(css_root):
    for file in files:
        if file.endswith(".css"):
            # absolute path
            abs_path = os.path.join(root, file)
            # relative path from project root
            # project root is 3 levels up from css\modules\gemini ? No, css\modules\gemini is in root\css\modules\gemini
            # Root is C:\Users\alvin\Documents\Unidex File\Personal Projects Workstation\Tests-Unidex\Tests and Experiments\NewPageObservation\Workshop
            project_root = r"C:\Users\alvin\Documents\Unidex File\Personal Projects Workstation\Tests-Unidex\Tests and Experiments\NewPageObservation\Workshop"
            rel_path = os.path.relpath(abs_path, project_root).replace("\\", "/")
            css_files.append(rel_path)

print(f"Found {len(css_files)} CSS files.")

# 2. Read manifest.js
with open(manifest_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 3. Inject Scripts
# We look for "scripts: ["
# We will insert our new scripts at the end of the array, before "],"
scripts_to_add = [
    "js/modules/gemini/gemini-init.js",
    "js/modules/gemini/Script_Loader/Script_Loader.js"
]

# Find the end of scripts array
# This is a bit fragile with text processing, but manifest.js structure is known.
# Look for "styles: [" which comes after scripts.
if "styles: [" in content:
    parts = content.split("styles: [")
    scripts_part = parts[0]
    styles_part = "styles: [" + parts[1]
    
    # In scripts_part, find the last "]"
    last_bracket_scripts = scripts_part.rfind("]")
    
    scripts_insert = ",\n        // Gemini Integration\n"
    for s in scripts_to_add:
        scripts_insert += f"        '{s}',\n"
    
    new_scripts_part = scripts_part[:last_bracket_scripts] + scripts_insert + scripts_part[last_bracket_scripts:]
    
    # Now Styles
    # existing styles end with "]" before "};"
    last_bracket_styles = styles_part.rfind("]")
    
    styles_insert = ",\n        // Gemini Integration Styles\n"
    for s in css_files:
        styles_insert += f"        '{s}',\n"
        
    new_styles_part = styles_part[:last_bracket_styles] + styles_insert + styles_part[last_bracket_styles:]
    
    new_content = new_scripts_part + new_styles_part
    
    with open(manifest_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Updated manifest.js")

else:
    print("Could not find 'styles: [' marker in manifest.js")
