# Routes — the one rule

**Never import a Prisma client in a route. Always use `req.db`.**

```js
// wrong — always talks to the live database
import { prisma } from "../lib/prisma.js";
const quotes = await prisma.quotation.findMany();

// right — talks to whichever instance this session logged into
const quotes = await req.db.quotation.findMany();
```

`requireAuth` reads the `db` claim out of the signed login token and sets
`req.db` to the matching client (`demo.db` or `dev.db`). Because the claim lives
in the token, a session cannot switch instance by sending a different header or
query string — it would have to log in again.

The only exception is the handful of routes that run *before* a token exists
(login, signup, demo-accounts). Those resolve their own client from the mode the
caller asked for, which is safe: picking which instance to sign in to is the
caller's decision, and each database holds a separate list of accounts.

Every later phase copies this pattern.
