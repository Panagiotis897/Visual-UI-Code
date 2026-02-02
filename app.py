import os
import subprocess
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return render_template('index.html')

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

@app.route('/api/save_file', methods=['POST'])
def save_file():
    data = request.json
    filename = data.get('filename')
    content = data.get('content')
    
    # Basic path traversal protection
    if '..' in filename or filename.startswith('/') or filename.startswith('\\'):
         return jsonify({'error': 'Invalid filename'}), 400
         
    try:
        with open(filename, 'w') as f:
            f.write(content)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
