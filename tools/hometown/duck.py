# tools/hometown/duck.py: the one way the compiler opens duckdb. Extensions are LOADED from a directory installed ahead
# of time (the town-builder image does it at build time); nothing is ever downloaded at run time, so a build reads the
# exact extension bytes its image was made with and a worker never depends on extensions.duckdb.org being reachable.
#
#   DUCKDB_EXTENSION_DIRECTORY   where httpfs and spatial live (the image: /opt/duckdb-ext). Unset: duckdb's own default
#                                (~/.duckdb/extensions), the dev Mac's.
#   python tools/hometown/duck.py --install    the ONE explicit install step (the Dockerfile, a new dev venv)
#   python tools/hometown/duck.py --check      exit 1 unless both extensions load from that directory
import os
import sys

import duckdb

EXTENSIONS = ('httpfs', 'spatial')


class MissingExtension(RuntimeError):
    pass


def ext_dir():
    return os.environ.get('DUCKDB_EXTENSION_DIRECTORY') or None


def _base():
    c = duckdb.connect()
    # (never fetch an extension behind our back: an unknown function must fail, not install something)
    c.execute('SET autoinstall_known_extensions = false; SET autoload_known_extensions = false;')
    d = ext_dir()
    if d:
        if not os.path.isdir(d):
            raise MissingExtension('DUCKDB_EXTENSION_DIRECTORY=%s does not exist (python tools/hometown/duck.py --install)' % d)
        c.execute("SET extension_directory = '%s'" % d.replace("'", "''"))
    return c


def connect(*exts, threads=None, memory_limit=None, object_cache=False):
    """A duckdb connection with the named extensions LOADED (default: spatial). Raises MissingExtension, never installs."""
    exts = exts or ('spatial',)
    c = _base()
    for e in exts:
        assert e in EXTENSIONS, e
        try:
            c.execute('LOAD %s' % e)
        except duckdb.Error as err:
            raise MissingExtension('duckdb extension %r is not installed in %s (python tools/hometown/duck.py --install): %s'
                                   % (e, ext_dir() or 'the default extension directory', str(err).splitlines()[0]))
    if threads:
        c.execute('SET threads = %d' % int(threads))
    if memory_limit:
        c.execute("SET memory_limit = '%s'" % memory_limit)
    if object_cache:
        c.execute('SET enable_object_cache = true')
    return c


def install():
    c = _base()
    for e in EXTENSIONS:
        c.execute('INSTALL %s' % e)
    return check()


def check():
    c = connect(*EXTENSIONS)
    rows = c.execute("SELECT extension_name, extension_version, install_path FROM duckdb_extensions() WHERE extension_name IN ('httpfs', 'spatial') ORDER BY 1").fetchall()
    return {'duckdb': duckdb.__version__, 'dir': ext_dir(), 'extensions': [{'name': n, 'version': v, 'path': p} for n, v, p in rows]}


if __name__ == '__main__':
    import json
    try:
        print(json.dumps(install() if '--install' in sys.argv else check(), sort_keys=True))
    except MissingExtension as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
