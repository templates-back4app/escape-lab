# escape-lab

[![Deploy on Back4app](https://img.shields.io/badge/Deploy%20on-Back4app-1568B8?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMMiA3djEwbDEwIDUgMTAtNVY3eiIvPjwvc3ZnPg==)](https://www.back4app.com/signup?utm_source=github&utm_medium=repo&utm_campaign=escape-lab)

An app is built on one backend, carried to a second backend that shares nothing
with the first, and then both are asked the same eleven questions.

It answers the only lock-in question that matters: **if you left today, what would
still work?**

> **Read the article:** [Backend Lock-In, Tested: We Exported an App and Moved It. Here Is What Survived](https://www.back4app.com/blog/backend-lock-in-export-and-move-your-app?utm_source=github&utm_medium=repo&utm_campaign=escape-lab)

## Run it

```
./run.sh
```

Needs Docker and Node 22. Both backends are destroyed and rebuilt on every run, so
the output is the same each time.

Then, separately:

```
./carry-passwords.sh
```

## What it found

Eight of the eleven checks come out identical on the copy. Two of the three that
do not are the same problem: logins.

| | careful move | naive move |
| --- | --- | --- |
| rows, schema, queries | same | same |
| a relationship between two rows | same | **broken** |
| an uploaded image | same | **HTTP 404** |
| a row restricted to its owner | same | **owner is a user that does not exist** |
| server-side code | same | same |
| the creation date of every row | **rewritten** | **rewritten** |
| a user logging in with their password | **fails** | **fails** |

The naive move is the obvious one: take the exported JSON and push it up. `NAIVE=1
./run.sh` does exactly that, so you can watch which parts of the app it breaks.

Two things the API will not give you at all:

- **credentials.** The user object the API returns has no password field, hashed or
  otherwise. `carry-passwords.sh` shows the database row does have one, and that
  writing that single field into the copy's database restores the login.
- **server-side code.** No endpoint returns the source of a cloud function. It
  travels if, and only if, it is in a repository you control.

## The pieces

| file | what it does |
| --- | --- |
| `compose.yml` | two backends, separate databases, separate app ids, nothing shared |
| `seed.mjs` | builds the app on the first one: classes, 121 rows, a relationship, a file, 3 users, one owner-only row |
| `export.mjs` | takes it all out through the public API and reports what the API withholds |
| `import.mjs` | rebuilds it on the second one from `./export` alone (`NAIVE=1` skips the remapping) |
| `verify.mjs` | the eleven checks, run against both, side by side |
| `deadlink.mjs` | what the exported file URLs are worth once the old backend stops answering |
| `carry-passwords.sh` | the credential question, at the API level and at the database level |

## What to check before you build on something

1. Is there an API that returns your schema and every row, without asking anyone?
2. Can you download the bytes of your uploaded files, not just URLs pointing at them?
3. Is your server-side code a file in your repository?
4. Can you reach the database, or only the API? That is what decides whether your
   users keep their passwords.
