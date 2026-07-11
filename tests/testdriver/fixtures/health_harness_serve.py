import app
from django.core.wsgi import get_wsgi_application
from wsgiref.simple_server import make_server
make_server("127.0.0.1", 8000, get_wsgi_application()).serve_forever()
