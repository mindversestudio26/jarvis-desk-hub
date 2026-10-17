"""Render only; never connects, changes credentials or executes SQL."""
import argparse
import re


def render(database, runtime, migration):
    if not re.fullmatch(r'[a-z0-9]+_jarvis_(stg|verify)', database):
        raise ValueError('Dedicated staging database required')
    for user in [runtime, migration]:
        if not re.fullmatch(r'[a-z0-9]+_jv[a-z0-9_]+', user):
            raise ValueError('Dedicated staging user required')
    if runtime == migration:
        raise ValueError('Migration and runtime identities must differ')
    return f'''-- REVIEW ONLY: execute with authorized database administration, never runtime.
-- Existing accounts only; no password/user creation or global grants.
REVOKE DELETE HISTORY, SHOW CREATE ROUTINE ON `{database}`.* FROM '{runtime}'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON `{database}`.* TO '{runtime}'@'127.0.0.1';
-- Initial five-table installation only: CREATE, no DROP/ALTER/GRANT OPTION.
REVOKE ALL PRIVILEGES ON `{database}`.* FROM '{migration}'@'127.0.0.1';
GRANT CREATE ON `{database}`.* TO '{migration}'@'127.0.0.1';
-- Revoke CREATE after reviewed installation. Future migrations need separate review.
-- Do not infer runtime least privilege: query effective schema/global/table/role grants.
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ['database', 'runtime', 'migration']:
        parser.add_argument('--' + field, required=True)
    options = parser.parse_args()
    print(render(options.database, options.runtime, options.migration))
