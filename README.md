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

Testing

* JUnit 5
* MockMvc
* Testcontainers
* Vitest
* React Testing Library

DevOps

* Docker
* GitHub Actions

## Implemented Features

* Job posting CRUD
* Keyword search
* Application status filtering and management
* Pagination
* Sorting
* Required skills extraction
* Job posting memo CRUD
* Monthly salary registration and editing
* Monthly salary range filtering
* Invalid salary range option prevention
* Required skills stale-response prevention with AbortController
* Optimistic locking with JPA @Version
* ETag / If-Match conditional updates
* PostgreSQL pg_trgm + GIN search optimization
* Malformed If-Match header validation
* URL query state for keyword, status, and page
* Browser history restoration
* Pagination boundary correction
* Frontend/backend automated tests
* GitHub Actions CI

## Architecture

React
↓ REST API
Spring Boot
↓ Service / Spring Data JPA
PostgreSQL

Database schema changes are managed with Flyway.

Frontend memo state management is separated into a custom hook, while UI-related state remains in the component.

Search conditions are synchronized with URL query parameters through React Router.

## Current Development

Improving regression test coverage

Hardening If-Match validation

Improving frontend state consistency

Updating project documentation

## Planned

* Improve frontend UI and styling
* Additional job management features
* Continue AWS deployment learning and deployment verification
