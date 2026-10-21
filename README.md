# JobLens Japan

求人情報を保存・検索・管理するために開発中のWebアプリケーション。

This project focuses not only on basic CRUD operations, but also on API consistency, 
concurrency control, search performance, frontend state management, and regression testing.

Status: In Development

## Tech Stack

Backend

* Java 21
* Spring Boot
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
- Advanced search filter UI
- PostgreSQL `pg_trgm` + GIN search optimization

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
- GitHub Actions CI

## Architecture

React
↓ REST API
Spring Boot
↓ Service / Spring Data JPA
PostgreSQL

Database schema changes are managed with Flyway.

Frontend memo state management is separated into a custom hook, while UI-related state remains in the component.

Keyword, application status, and page are synchronized with URL query parameters through React Router.

Docker Compose provides a local environment, with Nginx serving the frontend and proxying API requests.

## Current Development

- Improving consistency between URL parameters and applied search filters

- Expanding regression tests for concurrent updates and asynchronous responses

- Refactoring growing frontend state-management responsibilities

## Planned

* Job posting detail page
* Location, employment type, and remote work filters
* Continue AWS deployment learning and deployment verification
