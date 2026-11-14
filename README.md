# JobLens Japan

A web application with a Japanese UI, under development for saving, searching, and managing job postings.

This project focuses not only on basic CRUD operations, but also on API consistency,
concurrency control, search performance, authentication, frontend state management, and regression testing.

Status: In Development

## Tech Stack

Backend

* Java 21
* Spring Boot
* Spring Security
* Spring Session JDBC
* Spring Data JPA
* Hibernate
* PostgreSQL
* Flyway

Frontend

* React
* TypeScript
* Vite
* React Router

Testing

* JUnit Jupiter
* MockMvc
* Testcontainers
* Vitest
* React Testing Library

DevOps

* Docker / Docker Compose
* Nginx
* GitHub Actions

## Implemented Features

### Job Posting Management

- Job posting CRUD
- Job posting detail page with automatic analysis, memos, status changes, and history
- Job posting list as summary cards with a short excerpt of the original text and a fixed overtime pay badge
- Application status filtering and updates
- Pagination and sorting
- Job posting memo CRUD
- Application deadline registration and editing
- Application status change history with automatic refresh, limited to the latest 100 entries per posting
- Rule-based technical keyword extraction from job posting text
- Rule-based job posting analysis on the detail page: splits pasted text into sections by heading, ignores other listings that job sites append, and detects fixed overtime pay (固定残業代) with its hours and the source lines as evidence, keeping "not mentioned" separate from "cannot determine"
- Required and preferred skill judgment: classifies each technology as required, preferred, listed in the requirements without a marker, contradictory, or only mentioned elsewhere, handling negations and "any one of" choices, with the source lines as evidence
- Analysis evidence highlighted in the original text on the detail page ("原文で見る")
- First posting flow: the new posting's detail page opens after creation with a notice, and an empty list shows how to get started
- Original text character counter, with submissions over the limit blocked instead of truncating drafts
- A separate page title for each page, without the posting name on the detail page
- Application status summaries using a single grouped database query

### Search and Filtering

- Keyword search
- Monthly salary range filtering and validation
- Application deadline range filtering and validation
- Reversed deadline ranges blocked before a search request is sent
- Advanced search filter UI
- PostgreSQL `pg_trgm` + GIN search optimization

### Authentication and Authorization

- Email-based signup, login, and logout
- Session authentication with Spring Session JDBC
- CSRF protection for the single-page application
- Per-user job posting ownership, with other users' resources returned as 404
- Login state synchronization across browser tabs
- Screen reset when the logged-in user changes
- Account deletion with password confirmation

### Security and Error Handling

- Nginx rate limiting for login, signup, account deletion, and write APIs
- Nginx request body size limit
- Security headers, including a Content Security Policy
- Job posting source URLs restricted to http and https
- Per-user storage limits for job postings, memos, and status history, plus a total user limit
- Consistent JSON API error responses
- Database error mapping based on SQLState

### Concurrency and API Consistency

- Optimistic locking with JPA `@Version`
- ETag / If-Match conditional updates
- Malformed If-Match header validation
- Flush-time optimistic lock conflict handling

### Frontend Reliability

- Job posting analysis stale-response prevention with `AbortController`
- Job posting list stale-response protection
- Background refresh of memos and history that keeps the current list and unsaved input on screen
- Data-loading hooks that do not refetch when a new fetcher function is passed on each render
- Memo mutation retry handling
- Memo stale save-response protection
- URL query state for all search conditions (keyword, status, salary, deadline, sorting, page), ignoring invalid values
- Search condition restoration on browser back/forward and when returning from the detail page
- Pagination boundary correction
- Edit-session protection and recovery after version conflicts
- Field-level validation messages in both create and edit forms
- Unsaved create, edit, and memo input kept across session expiry, and cleared on logout or user change

### Testing and CI

- Backend and frontend regression tests
- PostgreSQL integration tests with Testcontainers
- Optimistic locking integration tests
- Regression tests for request validation, field-level error display, independent summary loading
- Rule tests for the job posting analysis (fixed overtime pay, required and preferred skills)
- Docker Compose smoke tests
- GitHub Actions CI

## Architecture

```text
React
↓ REST API
Nginx
↓ Reverse proxy
Spring Boot
↓ Service / Spring Data JPA
PostgreSQL
```

Database schema changes are managed with Flyway.

Authentication uses server-side sessions stored in PostgreSQL through Spring Session JDBC.

Job posting analysis is computed from the saved original text on each request and is not stored.

Detail page data (memos, history, analysis) is loaded through custom hooks, while UI-related state remains in the component.

All search conditions are synchronized with URL query parameters through React Router.

Docker Compose provides a local environment, with Nginx serving the frontend and proxying API requests.

## Current Development

- Adding more analysis items to the detail page, such as required Japanese level and visa support

- Preparing production settings for deployment, including proxy headers, HSTS, secure cookies, and database and actuator exposure

## Planned

* Job posting detail page
* Location, employment type, and remote work filters
* Continue AWS deployment learning and deployment verification
