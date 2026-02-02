import unittest
import json
import os
import sys

# Add parent directory to path to import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

class VisualUICodeTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_index_route(self):
        response = self.app.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Visual UI Code', response.data)

    def test_run_command(self):
        # Test echo command
        data = {'command': 'echo "Hello World"'}
        response = self.app.post('/api/run_command', 
                                 data=json.dumps(data),
                                 content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('Hello World', data['stdout'])

    def test_save_file_security(self):
        # Test path traversal prevention
        data = {'filename': '../test.txt', 'content': 'test'}
        response = self.app.post('/api/save_file', 
                                 data=json.dumps(data),
                                 content_type='application/json')
        self.assertEqual(response.status_code, 400)

if __name__ == '__main__':
    unittest.main()
