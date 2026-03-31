from app.config_schema import AppConfig, FileConfig
from app.interfaces.api.v1.files import allowed_file


def test_allowed_file_uses_default_extensions_when_config_missing(app):
    with app.app_context():
        app.config.pop('ALLOWED_EXTENSIONS', None)

        assert allowed_file('dataset.csv') is True
        assert allowed_file('dataset.xlsx') is True
        assert allowed_file('dataset.txt') is False


def test_app_default_allowed_extensions_include_excel(app):
    with app.app_context():
        assert app.config['ALLOWED_EXTENSIONS'] == {'csv', 'xls', 'xlsx'}


def test_schema_default_allowed_extensions_include_excel():
    assert FileConfig().allowed_extensions == {'csv', 'xls', 'xlsx'}
    assert AppConfig().file.allowed_extensions == {'csv', 'xls', 'xlsx'}


def test_allowed_file_respects_explicit_config_without_implicit_default_union(app):
    with app.app_context():
        app.config['ALLOWED_EXTENSIONS'] = {'csv'}

        assert allowed_file('dataset.csv') is True
        assert allowed_file('dataset.xlsx') is False
