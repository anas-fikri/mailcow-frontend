# Migration v1 → v2

Date: 2026-10-14T09:37:21Z

- adrs: 27
- handoffs: 6
- knowledge: 49
- tasks: 40

## Warnings
- dropped machine-specific config: BROWSER_MCP_ENABLED, BROWSER_MCP_NAME, BROWSER_MCP_URL, PROJECT_ROOT
- no check command detected; set [check] cmd in aitk.toml
- current-task.md is free-form: kept in docs/ai/_legacy/, shown by `aitk brief` until tasks exist
- 5 file(s) in docs/ai/tasks are not tasks: moved to docs/ai/_legacy/tasks/

## Preserved verbatim
- docs/ai/_legacy/AGENTS.md
- docs/ai/_legacy/ai-state.json
- docs/ai/_legacy/current-task.md
- docs/ai/_legacy/decisions.md
- docs/ai/_legacy/handoff.md
- docs/ai/_legacy/knowledge.md
- docs/ai/_legacy/tasks/20260818-125516-114124.previous.md
- docs/ai/_legacy/tasks/20260818-142155-180721.previous.md
- docs/ai/_legacy/tasks/20260819-103030-365882.previous.md
- docs/ai/_legacy/tasks/20260819-104513-330340.previous.md
- docs/ai/_legacy/tasks/20260819-105957-306646.previous.md
- docs/ai/_legacy/tasks/20260819-130705-700312.previous.md
- docs/ai/_legacy/tasks/20260819-140923-110737.previous.md
- docs/ai/_legacy/tasks/20260819-141730-202327.previous.md
- docs/ai/_legacy/tasks/20260819-142017-382878.previous.md
- docs/ai/_legacy/tasks/20260819-142636-337630.previous.md
- docs/ai/_legacy/tasks/20260819-143808-382111.previous.md
- docs/ai/_legacy/tasks/20260819-145627-255339.previous.md
- docs/ai/_legacy/tasks/20260819-150558-273339.previous.md
- docs/ai/_legacy/tasks/20260819-151451-148560.previous.md
- docs/ai/_legacy/tasks/20260819-152048-151547.previous.md
- docs/ai/_legacy/tasks/20260819-152539-885255.previous.md
- docs/ai/_legacy/tasks/20260820-100501-388715.previous.md
- docs/ai/_legacy/tasks/20260820-104931-250388.previous.md
- docs/ai/_legacy/tasks/20260820-105602-244471.previous.md
- docs/ai/_legacy/tasks/20260820-110117-165829.previous.md
- docs/ai/_legacy/tasks/20260820-110511-162155.previous.md
- docs/ai/_legacy/tasks/20260820-111241-959627.previous.md
- docs/ai/_legacy/tasks/20260820-114411-136241.previous.md
- docs/ai/_legacy/tasks/20260820-125059-377940.previous.md
- docs/ai/_legacy/tasks/20260820-125333-305684.previous.md
- docs/ai/_legacy/tasks/20260820-125654-156816.previous.md
- docs/ai/_legacy/tasks/20260820-131428-282178.previous.md
- docs/ai/_legacy/tasks/20260820-131813-225244.previous.md
- docs/ai/_legacy/tasks/20260820-132742-138659.previous.md
- docs/ai/_legacy/tasks/20260820-133121-262175.previous.md
- docs/ai/_legacy/tasks/20260820-133521-293553.previous.md
- docs/ai/_legacy/tasks/20260820-134013-202650.previous.md
- docs/ai/_legacy/tasks/20260827-134738-153596.previous.md
- docs/ai/_legacy/tasks/20260827-145747-418514.previous.md
- docs/ai/_legacy/tasks/20260827-154014-106687.previous.md
- docs/ai/_legacy/tasks/20260827-161438-257180.previous.md
- docs/ai/_legacy/tasks/20260827-162124-324499.previous.md
- docs/ai/_legacy/tasks/20260828-043403-608230.previous.md
- docs/ai/_legacy/tasks/20260828-050008-281836.previous.md
- docs/ai/_legacy/tasks/20260828-102701-261571.previous.md
- docs/ai/_legacy/tasks/20260922-105739-174098.previous.md
- docs/ai/_legacy/tasks/20260922-115707-317695.previous.md
- docs/ai/_legacy/tasks/20260922-122203-130733.previous.md
- docs/ai/_legacy/tasks/20260923-012329-321379.previous.md
- docs/ai/_legacy/tasks/20260923-014649-923291.previous.md
