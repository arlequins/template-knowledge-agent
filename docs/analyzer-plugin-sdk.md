# Analyzer Plugin SDK

`@arlequins/agent-core` exposes a small analyzer boundary for legacy language
extensions. A plugin implements `detect → plan → extract → normalize` and emits
the common `AnalyzerKnowledgeUnit` and `AnalyzerKnowledgeEdge` shapes. The first
certified plugin remains the TypeScript/T3 analyzer; Java/Spring, Ruby/Rails,
and C#/ASP.NET plugins can be added without changing retrieval or chat code.

Plugins run in bounded batch jobs. They must not execute repository lifecycle
scripts by default, must preserve source paths and commit provenance, and must
pass malformed-project, incremental-update, and authorization fixtures before
being enabled for a workspace.
