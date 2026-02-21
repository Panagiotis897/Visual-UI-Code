import os
import subprocess
import re
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

# Asset Configuration
SAFE_BASE_DIR = os.path.abspath(os.getcwd())
PROJECTS_DIR = os.path.join(SAFE_BASE_DIR, 'projects')
os.makedirs(PROJECTS_DIR, exist_ok=True)

ASSET_FOLDER = os.path.join(SAFE_BASE_DIR, 'static', 'assets')
os.makedirs(ASSET_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = ASSET_FOLDER
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/assets', methods=['GET'])
def list_assets():
    try:
        files = []
        for f in os.listdir(app.config['UPLOAD_FOLDER']):
            if allowed_file(f):
                files.append({
                    'name': f,
                    'url': f'/static/assets/{f}'
                })
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/assets', methods=['POST'])
def upload_asset():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        return jsonify({
            'success': True,
            'name': filename,
            'url': f'/static/assets/{filename}'
        })
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/api/run_command', methods=['POST'])
def run_command():
    data = request.json
    command = data.get('command')
    try:
        # Security warning: This allows arbitrary command execution. 
        # In a real production app, this should be heavily restricted.
        result = subprocess.run(command, shell=True, capture_output=True, text=True, cwd=os.getcwd())
        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/create_project', methods=['POST'])
def create_project():
    data = request.json
    name = data.get('name')
    path = data.get('path', '~/projects')
    project_type = data.get('type', 'static')
    transpiler = data.get('transpiler') # 'bun', 'tsc'

    if not name:
        return jsonify({'error': 'Project name is required'}), 400

    # Expand user path
    base_path = os.path.expanduser(path)
    project_path = os.path.join(base_path, name)

    try:
        os.makedirs(project_path, exist_ok=True)
        
        # Create basic files
        index_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="app">
        <h1>Welcome to {}</h1>
    </div>
    <script src="{}"></script>
</body>
</html>""".format(name, name, 'main.js' if project_type != 'ts' else 'main.ts') # Simple assumption for now

        style_content = """body {
    font-family: sans-serif;
    margin: 0;
    padding: 20px;
    background-color: #f0f0f0;
}
h1 { color: #333; }
"""

        script_content = """console.log('Project {} initialized');
""".format(name)

        with open(os.path.join(project_path, 'index.html'), 'w') as f:
            f.write(index_content)
        
        with open(os.path.join(project_path, 'style.css'), 'w') as f:
            f.write(style_content)

        if project_type == 'ts':
            with open(os.path.join(project_path, 'main.ts'), 'w') as f:
                f.write(script_content)
            
            # Create tsconfig.json
            tsconfig = {
                "compilerOptions": {
                    "target": "es6",
                    "module": "commonjs",
                    "strict": True,
                    "esModuleInterop": True,
                    "skipLibCheck": True,
                    "forceConsistentCasingInFileNames": True
                }
            }
            import json
            with open(os.path.join(project_path, 'tsconfig.json'), 'w') as f:
                json.dump(tsconfig, f, indent=4)
            
            if transpiler == 'bun':
                # Create a basic package.json for Bun
                package_json = {
                    "name": name.lower().replace(' ', '-'),
                    "module": "index.ts",
                    "type": "module",
                    "devDependencies": {
                        "bun-types": "latest"
                    }
                }
                with open(os.path.join(project_path, 'package.json'), 'w') as f:
                    json.dump(package_json, f, indent=4)

        else:
            with open(os.path.join(project_path, 'main.js'), 'w') as f:
                f.write(script_content)

        return jsonify({'success': True, 'path': project_path})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/list_files', methods=['POST'])
def list_files():
    data = request.json
    path = data.get('path')
    recursive = data.get('recursive', False)
    
    if not path:
        return jsonify({'error': 'Path is required'}), 400

    full_path = os.path.abspath(os.path.expanduser(path))
    if not full_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Access denied'}), 403

    if not os.path.exists(full_path):
        return jsonify({'error': 'Path does not exist'}), 404

    try:
        items = []
        if recursive:
            for root, dirs, files in os.walk(full_path):
                for name in files:
                    items.append({
                        'name': name,
                        'type': 'file',
                        'path': os.path.join(root, name)
                    })
                for name in dirs:
                    items.append({
                        'name': name,
                        'type': 'dir',
                        'path': os.path.join(root, name)
                    })
        else:
            for item in os.listdir(full_path):
                item_path = os.path.join(full_path, item)
                is_dir = os.path.isdir(item_path)
                items.append({
                    'name': item,
                    'type': 'dir' if is_dir else 'file',
                    'path': item_path # full path for next request
                })
        
        # Sort: directories first, then files
        items.sort(key=lambda x: (x['type'] != 'dir', x['name'].lower()))
        
        return jsonify({'items': items, 'path': full_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/read_file', methods=['POST'])
def read_file():
    data = request.json
    path = data.get('path')
    
    if not path:
        return jsonify({'error': 'Path is required'}), 400

    full_path = os.path.abspath(os.path.expanduser(path))
    if not full_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Access denied'}), 403
        
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({'content': content})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/append_file', methods=['POST'])
def append_file():
    data = request.json
    path = data.get('path')
    content = data.get('content')
    
    if not path or content is None:
        return jsonify({'error': 'Path and content are required'}), 400

    full_path = os.path.abspath(os.path.expanduser(path))
    if not full_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Access denied'}), 403
    
    if not os.path.exists(full_path):
        return jsonify({'error': 'File does not exist'}), 404

    try:
        # Check if file ends with newline
        with open(full_path, 'r', encoding='utf-8') as f:
            existing_content = f.read()
            
        prefix = ''
        if existing_content and not existing_content.endswith('\n'):
            prefix = '\n'
            
        with open(full_path, 'a', encoding='utf-8') as f:
            f.write(prefix + content + '\n')
            
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/save_file', methods=['POST'])
def save_file():
    data = request.json
    filename = data.get('filename')
    content = data.get('content')
    
    full_path = os.path.abspath(os.path.join(SAFE_BASE_DIR, filename))
    if not full_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Access denied'}), 403
         
    try:
        with open(full_path, 'w') as f:
            f.write(content)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/create_folder', methods=['POST'])
def create_folder():
    data = request.json
    path = data.get('path')
    
    if not path:
        return jsonify({'error': 'Path is required'}), 400
        
    full_path = os.path.abspath(os.path.expanduser(path))
    if not full_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Access denied'}), 403

    try:
        os.makedirs(full_path, exist_ok=True)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/create_file', methods=['POST'])
def create_file():
    data = request.json
    path = data.get('path')
    
    if not path:
        return jsonify({'error': 'Path is required'}), 400
        
    full_path = os.path.abspath(os.path.expanduser(path))
    if not full_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Access denied'}), 403

    try:
        # Create parent directories if they don't exist
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        with open(full_path, 'w') as f:
            f.write('') # Create empty file
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete_file', methods=['POST'])
def delete_file():
    data = request.json
    path = data.get('path')
    
    if not path:
        return jsonify({'error': 'Path is required'}), 400
        
    full_path = os.path.abspath(os.path.expanduser(path))
    if not full_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Access denied'}), 403
    
    try:
        if os.path.isdir(full_path):
            import shutil
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rename_file', methods=['POST'])
def rename_file():
    data = request.json
    old_path = data.get('old_path')
    new_path = data.get('new_path')
    
    if not old_path or not new_path:
        return jsonify({'error': 'Both paths are required'}), 400
        
    full_old_path = os.path.abspath(os.path.expanduser(old_path))
    full_new_path = os.path.abspath(os.path.expanduser(new_path))
    if not full_old_path.startswith(SAFE_BASE_DIR) or not full_new_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Access denied'}), 403
    
    try:
        os.rename(full_old_path, full_new_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/github_import', methods=['POST'])
def github_import():
    data = request.json
    repo_url = data.get('repo_url')

    if not repo_url:
        return jsonify({'error': 'Repository URL is required'}), 400

    # Extract repo name from URL and sanitize
    repo_name = secure_filename(repo_url.split('/')[-1].replace('.git', ''))
    full_dest_path = os.path.abspath(os.path.join(PROJECTS_DIR, repo_name))

    # Path Traversal Check
    if not full_dest_path.startswith(SAFE_BASE_DIR):
        return jsonify({'error': 'Invalid destination path'}), 403

    try:
        if os.path.exists(full_dest_path):
             return jsonify({'error': 'Destination already exists', 'path': full_dest_path}), 409

        os.makedirs(os.path.dirname(full_dest_path), exist_ok=True)
        result = subprocess.run(['git', 'clone', repo_url, full_dest_path], capture_output=True, text=True)

        if result.returncode != 0:
            return jsonify({'error': 'Git clone failed', 'stderr': result.stderr}), 500

        return jsonify({'success': True, 'path': full_dest_path, 'name': repo_name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/index_project', methods=['POST'])
def index_project():
    data = request.json
    path = data.get('path')

    if not path:
        return jsonify({'error': 'Path is required'}), 400

    full_path = os.path.abspath(os.path.expanduser(path))

    # Path Traversal Check
    if not full_path.startswith(SAFE_BASE_DIR):
         return jsonify({'error': 'Access denied: Path outside safe directory'}), 403

    if not os.path.exists(full_path):
        return jsonify({'error': 'Path does not exist'}), 404

    classes = set()
    ids = set()

    # Regex patterns
    # CSS: .classname or #idname
    css_class_pattern = re.compile(r'\.([a-zA-Z0-9_-]+)')
    css_id_pattern = re.compile(r'#([a-zA-Z0-9_-]+)')

    # JS/TS/HTML specific patterns to be more precise
    # class="name" or id="name"
    attr_class_pattern = re.compile(r'class=[\'"]([a-zA-Z0-9_\-\s]+)[\'"]')
    attr_id_pattern = re.compile(r'id=[\'"]([a-zA-Z0-9_-]+)[\'"]')

    js_class_pattern = re.compile(r'classList\.(?:add|remove|contains|toggle)\([\'"]([a-zA-Z0-9_-]+)[\'"]\)')
    js_id_pattern = re.compile(r'getElementById\([\'"]([a-zA-Z0-9_-]+)[\'"]\)')

    # querySelector('.class') or querySelector('#id')
    qs_pattern = re.compile(r'querySelector(?:All)?\([\'"]([.#][a-zA-Z0-9_-]+)[\'"]\)')

    try:
        for root, _, files in os.walk(full_path):
            for file in files:
                if file.endswith(('.css', '.scss', '.less', '.js', '.ts', '.html')):
                    file_path = os.path.join(root, file)
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()

                        if file.endswith(('.css', '.scss', '.less')):
                            classes.update(css_class_pattern.findall(content))
                            ids.update(css_id_pattern.findall(content))

                        if file.endswith('.html'):
                            # Find class="a b c"
                            for cls_match in attr_class_pattern.findall(content):
                                classes.update(cls_match.split())
                            ids.update(attr_id_pattern.findall(content))
                            # Also CSS-like if there are <style> tags
                            classes.update(css_class_pattern.findall(content))
                            ids.update(css_id_pattern.findall(content))

                        if file.endswith(('.js', '.ts')):
                            classes.update(js_class_pattern.findall(content))
                            ids.update(js_id_pattern.findall(content))

                            for qs_match in qs_pattern.findall(content):
                                if qs_match.startswith('.'):
                                    classes.add(qs_match[1:])
                                elif qs_match.startswith('#'):
                                    ids.add(qs_match[1:])

        # Filter out common false positives if necessary
        # For now, just return everything unique
        return jsonify({
            'classes': sorted(list(classes)),
            'ids': sorted(list(ids))
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
