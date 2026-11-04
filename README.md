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
- Application status filtering and updates
- Pagination and sorting
- Job posting memo CRUD
- Application deadline registration and editing
- Application status change history with automatic refresh
- Rule-based technical keyword extraction from job posting text
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

### Security and Error Handling

- Nginx rate limiting for login and signup
- Nginx request body size limit
- Security headers, including a Content Security Policy
- Job posting source URLs restricted to http and https
- Consistent JSON API error responses
- Database error mapping based on SQLState

### Concurrency and API Consistency

- Optimistic locking with JPA `@Version`
- ETag / If-Match conditional updates
- Malformed If-Match header validation
- Flush-time optimistic lock conflict handling

### Frontend Reliability

- Required skills stale-response prevention with `AbortController`
- Job posting list stale-response protection
- Memo lazy loading and cache invalidation
- Memo mutation retry handling
- Memo stale save-response protection
- URL query state for keyword, status, and page
- Browser history restoration
- Pagination boundary correction
- Edit-session protection and recovery after version conflicts
- Field-level validation messages in both create and edit forms
- Preservation of the latest applied search conditions after status updates and deletions

### Testing and CI

- Backend and frontend regression tests
- PostgreSQL integration tests with Testcontainers
- Optimistic locking integration tests
- Regression tests for request validation, field-level error display, independent summary loading
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

Frontend memo state management is separated into a custom hook, while UI-related state remains in the component.

Keyword, application status, and page are synchronized with URL query parameters through React Router.

Docker Compose provides a local environment, with Nginx serving the frontend and proxying API requests.

## Current Development

- Improving consistency between URL parameters and applied search filters

- Preparing production settings for deployment, including proxy headers, HSTS, secure cookies, and database and actuator exposure

## Planned

* Job posting detail page
* Location, employment type, and remote work filters
* Continue AWS deployment learning and deployment verification
