use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_initial_tables",
        sql: "
            CREATE TABLE IF NOT EXISTS issues (
                id            INTEGER PRIMARY KEY,
                project_id    INTEGER NOT NULL,
                project_name  TEXT NOT NULL DEFAULT '',
                tracker       TEXT NOT NULL DEFAULT '',
                subject       TEXT NOT NULL,
                status        TEXT NOT NULL DEFAULT '',
                priority      TEXT NOT NULL DEFAULT '',
                assigned_to   TEXT,
                updated_on    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS time_entries (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_id      INTEGER NOT NULL,
                hours         REAL NOT NULL,
                comments      TEXT NOT NULL DEFAULT '',
                activity_id   INTEGER NOT NULL,
                spent_on      TEXT NOT NULL,
                synced        INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (issue_id) REFERENCES issues(id)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key           TEXT PRIMARY KEY,
                value         TEXT NOT NULL
            );
        ",
        kind: MigrationKind::Up,
    }]
}
