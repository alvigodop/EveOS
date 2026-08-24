# EveOS Instagram Connector

This is a user-initiated browser bridge for Instagram authentication.

When the user clicks Connect Instagram while signed in to Instagram, the extension reads only cookies belonging to instagram.com and sends them to the EveOS localhost server. EveOS stores those cookies in its local Camofox site-cookie configuration.

It does not read Chrome/Edge cookie databases, passwords, browsing history, or cookies for other sites.

Modern Chrome protects its default profile cookies with App-Bound Encryption and blocks remote debugging of the default data directory. EveOS therefore does not try to defeat browser credential protections or copy the browser SQLite cookie database.

Development install:
1. Open chrome://extensions.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this directory.
5. Sign in to Instagram normally.
6. Open the EveOS Instagram Connector extension and click Connect Instagram.
