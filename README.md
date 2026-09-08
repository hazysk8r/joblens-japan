# JobLens Japan

求人情報を保存・検索・管理するために開発中のWebアプリケーション。

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

Search conditions such as keyword, application status, salary range and sorting are sent to the backend through query parameters.

## Current Development

Monthly salary support has been implemented across the backend and frontend.

Salary-related frontend tests have been added.

Memo management has also been refactored into an event-driven lazy-loading structure using a custom hook.

## Planned

* Improve frontend UI and styling
* Continue accessibility improvements
* Continue AWS deployment learning and deployment verification
