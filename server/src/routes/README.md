# Routes

**Never import a Prisma client in a route. Use `req.db`.**

`requireAuth` reads the `db` claim from the signed login token and sets `req.db`
to the matching client (`demo.db` or `dev.db`). Because the claim lives in the
token, a session cannot switch instance by sending a different header or query
string.

The exception is the routes that run before a token exists — login, signup and
demo-accounts. Those resolve their own client from the requested mode; each
database holds a separate list of accounts.
