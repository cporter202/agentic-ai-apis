/**
 * Generate a focused README and category pages for the agentic AI subset.
 *
 * Source data comes from ../apify_actors.json, but the generated repo only
 * keeps the categories relevant to autonomous AI agents:
 * - Agents
 * - AI (displayed as AI Models)
 * - MCP Servers
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const jsonPath = path.join(ROOT_DIR, 'apify_actors.json');

const ALLOWED_CATEGORIES = [
    {
        displayName: 'Agents',
        folderName: 'agents-apis',
        sourceKeys: ['AGENTS', 'Agents'],
    },
    {
        displayName: 'AI Models',
        folderName: 'ai-models-apis',
        sourceKeys: ['AI'],
    },
    {
        displayName: 'MCP Servers',
        folderName: 'mcp-servers-apis',
        sourceKeys: ['MCP_SERVERS', 'MCP Servers'],
    },
];

const ALLOWED_CATEGORY_MAP = new Map();
for (const category of ALLOWED_CATEGORIES) {
    for (const sourceKey of category.sourceKeys) {
        ALLOWED_CATEGORY_MAP.set(sourceKey, category);
    }
}

if (!fs.existsSync(jsonPath)) {
    throw new Error(`Missing source data at ${jsonPath}`);
}

const actors = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

function shouldFilterActor(actor) {
    const title = (actor.title || actor.name || '').toLowerCase();
    const name = (actor.name || '').toLowerCase();
    const description = (actor.description || '').toLowerCase().trim();

    const filterPatterns = [
        /^my actor/i,
        /^testactor/i,
        /^test crawler/i,
        /^test actor/i,
        /^my actorrr/i,
        /^my actor\s*\d+$/i,
        /^test\s*$/i,
        /^test\s+crawler/i,
    ];

    if (filterPatterns.some((pattern) => pattern.test(title) || pattern.test(name))) {
        return true;
    }

    return description === 'test' || (description === '' && (title.includes('my actor') || title.includes('test')));
}

function truncateDescription(description, maxLength = 200) {
    if (!description || description.length <= maxLength) {
        return description || '-';
    }

    let cutPoint = maxLength;
    const lastSpace = description.lastIndexOf(' ', maxLength);
    if (lastSpace > maxLength * 0.8) {
        cutPoint = lastSpace;
    }

    return `${description.substring(0, cutPoint).trim()}...`;
}

function sanitizeTableValue(value) {
    return (value || '').replace(/\|/g, '&#124;').replace(/\n/g, ' ');
}

function groupActorsByAllowedCategory(allActors) {
    const grouped = new Map(ALLOWED_CATEGORIES.map((category) => [category.displayName, []]));

    for (const actor of allActors) {
        if (shouldFilterActor(actor)) {
            continue;
        }

        const categories = actor.categories || [];
        for (const categoryKey of categories) {
            const category = ALLOWED_CATEGORY_MAP.get(categoryKey);
            if (!category) {
                continue;
            }

            const list = grouped.get(category.displayName);
            const exists = list.some(
                (entry) => entry.name === actor.name && entry.username === actor.username
            );

            if (!exists) {
                list.push(actor);
            }
        }
    }

    return grouped;
}

function getLatestModifiedDate(allActors) {
    const includedActors = new Map();

    for (const actor of allActors) {
        if (shouldFilterActor(actor)) {
            continue;
        }

        const categories = actor.categories || [];
        const isIncluded = categories.some((category) => ALLOWED_CATEGORY_MAP.has(category));
        if (!isIncluded) {
            continue;
        }

        const key = `${actor.username || ''}/${actor.name || ''}`;
        const current = includedActors.get(key);

        if (!current) {
            includedActors.set(key, actor);
            continue;
        }

        const currentModified = current.modifiedAt ? Date.parse(current.modifiedAt) : 0;
        const candidateModified = actor.modifiedAt ? Date.parse(actor.modifiedAt) : 0;
        if (candidateModified > currentModified) {
            includedActors.set(key, actor);
        }
    }

    let latestTimestamp = 0;
    for (const actor of includedActors.values()) {
        const timestamp = actor.modifiedAt ? Date.parse(actor.modifiedAt) : 0;
        if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
        }
    }

    if (latestTimestamp === 0) {
        return new Date().toISOString().split('T')[0];
    }

    return new Date(latestTimestamp).toISOString().split('T')[0];
}

function writeCategoryReadme(category, categoryActors) {
    const categoryDir = path.join(ROOT_DIR, category.folderName);
    fs.mkdirSync(categoryDir, { recursive: true });

    const sortedActors = [...categoryActors].sort((a, b) =>
        (a.title || a.name || '').localeCompare(b.title || b.name || '')
    );

    let content = `# ${category.displayName}\n\n`;
    content += `<p align="right"><a href="../README.md#table-of-contents">Back to main list</a></p>\n\n`;
    content += `**${categoryActors.length.toLocaleString()} APIs in this category**\n\n`;
    content += `| API Name | Description |\n`;
    content += `|----------|-------------|\n`;

    for (const actor of sortedActors) {
        const title = sanitizeTableValue(actor.title || actor.name || 'Unknown');
        const url = actor.affiliate_url || actor.url || '';
        const description = sanitizeTableValue(truncateDescription(actor.description || ''));
        content += `| [${title}](${url}) | ${description || '-'} |\n`;
    }

    content += `\n`;
    fs.writeFileSync(path.join(categoryDir, 'README.md'), content, 'utf-8');
}

function removeDisallowedCategoryDirectories(allowedFolderNames) {
    const topLevelEntries = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
    const stableFolderNames = new Set(ALLOWED_CATEGORIES.map((category) => category.folderName));

    for (const entry of topLevelEntries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const looksLikeCategoryDir =
            entry.name.endsWith('-apis') || /-apis-\d+$/.test(entry.name);

        if (!looksLikeCategoryDir) {
            continue;
        }

        const isLegacyCountVariant = [...stableFolderNames].some(
            (folderName) => entry.name.startsWith(`${folderName}-`)
        );

        if (isLegacyCountVariant) {
            fs.rmSync(path.join(ROOT_DIR, entry.name), { recursive: true, force: true });
            continue;
        }

        if (allowedFolderNames.has(entry.name)) {
            continue;
        }

        fs.rmSync(path.join(ROOT_DIR, entry.name), { recursive: true, force: true });
    }
}

function writeRootReadme(categoryCounts) {
    const totalCount = categoryCounts.reduce((sum, category) => sum + category.count, 0);
    const latestModifiedDate = getLatestModifiedDate(actors);

    let content = `<div align="center">\n\n`;
    content += `<img src="./assets/readme-hero-v2.svg" alt="agentic-ai-apis hero banner" width="100%" />\n\n`;
    content += `<br />\n<br />\n\n`;
    content += `[![GitHub stars](https://img.shields.io/github/stars/cporter202/agentic-ai-apis?style=for-the-badge)](https://github.com/cporter202/agentic-ai-apis/stargazers)\n`;
    content += `[![GitHub forks](https://img.shields.io/github/forks/cporter202/agentic-ai-apis?style=for-the-badge)](https://github.com/cporter202/agentic-ai-apis/network/members)\n`;
    content += `[![Last commit](https://img.shields.io/github/last-commit/cporter202/agentic-ai-apis?style=for-the-badge)](https://github.com/cporter202/agentic-ai-apis/commits/main)\n`;
    content += `[![Repo size](https://img.shields.io/github/repo-size/cporter202/agentic-ai-apis?style=for-the-badge)](https://github.com/cporter202/agentic-ai-apis)\n\n`;
    content += `<p>\n`;
    content += `  <a href="#at-a-glance"><strong>At A Glance</strong></a>\n`;
    content += `  |\n`;
    content += `  <a href="#start-here"><strong>Start Here</strong></a>\n`;
    content += `  |\n`;
    content += `  <a href="#explore-the-stack"><strong>Explore The Stack</strong></a>\n`;
    content += `  |\n`;
    content += `  <a href="#why-this-repo-wins"><strong>Why This Repo Wins</strong></a>\n`;
    content += `  |\n`;
    content += `  <a href="#star-history"><strong>Star History</strong></a>\n`;
    content += `</p>\n\n`;
    content += `</div>\n\n`;

    content += `## At A Glance\n\n`;
    content += `> The ultimate collection of APIs for building autonomous AI agents - **${totalCount.toLocaleString()} production-ready APIs** across **Agents**, **AI Models**, and **MCP Servers**.\n\n`;
    content += `This repository is designed to feel like a launchpad, not a junk drawer. It is tightly scoped around the API layers that matter most when you are building autonomous systems, copilots, tool-using assistants, and MCP-native workflows.\n\n`;
    content += `| Metric | Count |\n`;
    content += `|--------|-------|\n`;
    content += `| Total APIs | ${totalCount.toLocaleString()} |\n`;
    content += `| Categories | ${categoryCounts.length} |\n`;
    content += `| Last Updated | ${latestModifiedDate} |\n`;
    content += `| Focus | Agentic AI infrastructure |\n\n`;
    content += `<table>\n`;
    content += `  <tr>\n`;
    content += `    <td width="33%" valign="top">\n`;
    content += `      <h3>Agents</h3>\n`;
    content += `      <p><strong>${categoryCounts[0].count.toLocaleString()} APIs</strong></p>\n`;
    content += `      <p>Execution layers, orchestration, autonomous task handling, and agent-style workflows.</p>\n`;
    content += `      <p><a href="./${categoryCounts[0].folderName}/"><strong>Open Agents Directory</strong></a></p>\n`;
    content += `    </td>\n`;
    content += `    <td width="33%" valign="top">\n`;
    content += `      <h3>AI Models</h3>\n`;
    content += `      <p><strong>${categoryCounts[1].count.toLocaleString()} APIs</strong></p>\n`;
    content += `      <p>Generation, reasoning, extraction, transformation, and model-powered product building blocks.</p>\n`;
    content += `      <p><a href="./${categoryCounts[1].folderName}/"><strong>Open AI Models Directory</strong></a></p>\n`;
    content += `    </td>\n`;
    content += `    <td width="33%" valign="top">\n`;
    content += `      <h3>MCP Servers</h3>\n`;
    content += `      <p><strong>${categoryCounts[2].count.toLocaleString()} APIs</strong></p>\n`;
    content += `      <p>Model Context Protocol integrations that connect assistants to real tools, systems, and data.</p>\n`;
    content += `      <p><a href="./${categoryCounts[2].folderName}/"><strong>Open MCP Servers Directory</strong></a></p>\n`;
    content += `    </td>\n`;
    content += `  </tr>\n`;
    content += `</table>\n\n`;

    content += `## Start Here\n\n`;
    content += `1. Pick the layer you need first: \`Agents\`, \`AI Models\`, or \`MCP Servers\`.\n`;
    content += `2. Open that category README and scan the API names and descriptions.\n`;
    content += `3. Click through to the provider page for implementation details, pricing, and docs.\n`;
    content += `4. Build your shortlist fast instead of wasting hours digging through irrelevant categories.\n\n`;

    content += `## Explore The Stack\n\n`;
    content += `<details open>\n<summary><strong>Agents</strong></summary>\n\n`;
    content += `Best for builders who need APIs that feel closer to execution and autonomy:\n\n`;
    content += `- agent workflows\n- orchestration layers\n- autonomous task completion\n- assistant behavior and action loops\n\n`;
    content += `[Browse Agents APIs](./${categoryCounts[0].folderName}/)\n\n`;
    content += `</details>\n\n`;
    content += `<details>\n<summary><strong>AI Models</strong></summary>\n\n`;
    content += `Best for builders who need intelligence and generation as a reusable service layer:\n\n`;
    content += `- reasoning and inference\n- summarization and extraction\n- content generation\n- analysis and transformation\n\n`;
    content += `[Browse AI Models APIs](./${categoryCounts[1].folderName}/)\n\n`;
    content += `</details>\n\n`;
    content += `<details>\n<summary><strong>MCP Servers</strong></summary>\n\n`;
    content += `Best for builders who want agents to use tools through structured interfaces:\n\n`;
    content += `- MCP-native tool integrations\n- external system connectivity\n- docs, search, analytics, scheduling, and developer workflows\n- assistants that need real-world actions\n\n`;
    content += `[Browse MCP Servers APIs](./${categoryCounts[2].folderName}/)\n\n`;
    content += `</details>\n\n`;

    content += `## Built For\n\n`;
    content += `<table>\n`;
    content += `  <tr>\n`;
    content += `    <td width="25%" align="center"><strong>Autonomous Assistants</strong></td>\n`;
    content += `    <td width="25%" align="center"><strong>AI Copilots</strong></td>\n`;
    content += `    <td width="25%" align="center"><strong>MCP Toolchains</strong></td>\n`;
    content += `    <td width="25%" align="center"><strong>Internal Automation</strong></td>\n`;
    content += `  </tr>\n`;
    content += `  <tr>\n`;
    content += `    <td width="25%" align="center"><strong>Research Agents</strong></td>\n`;
    content += `    <td width="25%" align="center"><strong>Workflow Engines</strong></td>\n`;
    content += `    <td width="25%" align="center"><strong>Tool-Using LLM Apps</strong></td>\n`;
    content += `    <td width="25%" align="center"><strong>Production AI Features</strong></td>\n`;
    content += `  </tr>\n`;
    content += `</table>\n\n`;

    content += `## Why This Repo Wins\n\n`;
    content += `- It is opinionated. This repo is not trying to be every API category on earth.\n`;
    content += `- It is agent-native. Everything revolves around the stack needed for autonomous AI systems.\n`;
    content += `- It is faster to use. The clutter is gone, so discovery is dramatically easier.\n`;
    content += `- It is better positioned. The repo name, README, and categories now all tell the same story.\n\n`;

    content += `## Scope Guarantee\n\n`;
    content += `This repository intentionally includes only:\n\n`;
    content += `- **Agents** for execution, orchestration, planning, and autonomous workflows\n`;
    content += `- **AI Models** for inference, generation, analysis, and reasoning\n`;
    content += `- **MCP Servers** for exposing tools and systems to AI assistants through MCP\n\n`;
    content += `Anything outside those three categories has been removed from the tracked repository structure.\n\n`;

    content += `## Star History\n\n`;
    content += `[![Star History Chart](https://api.star-history.com/svg?repos=cporter202/agentic-ai-apis&type=Date)](https://www.star-history.com/#cporter202/agentic-ai-apis&Date)\n\n`;

    content += `## Maintenance Notes\n\n`;
    content += `- A GitHub Actions workflow now syncs the Apify catalog daily and commits only when upstream data actually changes.\n`;
    content += `- The generation scripts in [settings](./settings/) are configured to rebuild only the three tracked categories above.\n`;
    content += `- The visual README layout is now part of the repo's default presentation, not just a temporary pass.\n`;
    content += `- API links keep the existing affiliate tracking from the upstream source data.\n`;

    fs.writeFileSync(path.join(ROOT_DIR, 'README.md'), content, 'utf-8');
}

const groupedActors = groupActorsByAllowedCategory(actors);
const categoryCounts = [];
const allowedFolderNames = new Set();

for (const category of ALLOWED_CATEGORIES) {
    const categoryActors = groupedActors.get(category.displayName) || [];
    allowedFolderNames.add(category.folderName);
    writeCategoryReadme(category, categoryActors);
    categoryCounts.push({
        displayName: category.displayName,
        count: categoryActors.length,
        folderName: category.folderName,
    });
}

removeDisallowedCategoryDirectories(allowedFolderNames);
writeRootReadme(categoryCounts);

console.log('Focused README and category pages generated successfully.');
