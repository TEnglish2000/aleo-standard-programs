const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load the .env file

// Read version number from .env file
const versionNumber = process.env.VERSION || '';

// Source files
const filesToCopy = [
  '../token_registry/build/main.aleo',
  '../wrapped_credits/build/main.aleo',
  '../pondo/pondo_protocol/build/main.aleo',
  '../pondo/validator_oracle/build/main.aleo',
  '../pondo/paleo_token/build/main.aleo',
  '../pondo/pondo_protocol_token/build/main.aleo',
  '../pondo/reference_delegator/build/main.aleo',
  '../pondo/delegators/delegator1/build/main.aleo',
  '../pondo/delegators/delegator2/build/main.aleo',
  '../pondo/delegators/delegator3/build/main.aleo',
  '../pondo/delegators/delegator4/build/main.aleo',
  '../pondo/delegators/delegator5/build/main.aleo',
  '../time_oracle/build/main.aleo',
  '../grant_disbursement/build/main.aleo',
  '../token_disbursement/build/main.aleo',
  '../pondo/test_program/build/main.aleo',
];

// Function to parse program name from a file
const parseProgramName = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let line of lines) {
    if (line.startsWith('program ')) {
      const parts = line.split(' ');
      if (parts.length >= 2) {
        return parts[1].replace(';', '');
      }
    }
  }

  throw new Error(`Program name not found in ${filePath}`);
};

// Function to update program name in the content
const updateProgramNameInContent = (content, oldName, newName) => {
  return content.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
};

// Function to add version number to program name
const addVersionNumber = (programName, versionNumber) => {
  const nameParts = programName.split('.');
  return `${nameParts[0]}${versionNumber}.${nameParts[1]}`;
};

// Read and parse all files
const fileContents = {};
const programNames = {};
filesToCopy.forEach(fileSrc => {
  const content = fs.readFileSync(fileSrc, 'utf8');
  const programName = parseProgramName(fileSrc);
  let newProgramName = programName;

  if (programName.startsWith('pondo_') || programName.startsWith('m')) {
    newProgramName = addVersionNumber(programName, versionNumber);
  }

  fileContents[fileSrc] = content;
  programNames[programName] = newProgramName;
});

// Update content for each file with new program names and copy to the target directory
const pondoProgramToCode = {};
filesToCopy.forEach((fileSrc) => {
  const programName = parseProgramName(fileSrc);
  const newProgramName = programNames[programName];
  let fileContent = fileContents[fileSrc];

  // Update imports in the file content
  Object.keys(programNames).forEach(oldName => {
    const newName = programNames[oldName];
    fileContent = updateProgramNameInContent(fileContent, oldName, newName);
  });

  pondoProgramToCode[newProgramName] = fileContent;

  // Write the updated content to the target directory
  const targetDir = path.join('.', 'programs');
  const fileDest = path.join(targetDir, newProgramName);
  pondoProgramToCode[newProgramName] = fileContent;
  fs.writeFileSync(fileDest, fileContent);
});

// Function to parse dependencies from a program file
const parseDependencies = (content) => {
  const lines = content.split('\n');
  const dependencies = [];

  lines.forEach((line) => {
    if (line.startsWith('import ')) {
      const parts = line.split(' ');
      if (parts.length >= 2) {
        const dependency = parts[1].replace(';', '');
        dependencies.push(dependency);
      }
    }
  });

  return dependencies;
};

// Parse dependencies and create the dependency tree
const dependencyTree = {};
filesToCopy.forEach((fileSrc) => {
  const programName = parseProgramName(fileSrc);
  const newProgramName = programNames[programName];
  const dependencies = parseDependencies(fileContents[fileSrc]).map(dep => {
    return programNames[dep] || dep;
  });

  dependencyTree[newProgramName] = dependencies;
});

// Topological sort of the programs based on dependencies
const topologicalSort = (graph) => {
  const visited = {};
  const stack = [];

  const visit = (node) => {
    if (!visited[node]) {
      visited[node] = true;
      (graph[node] || []).forEach(visit);
      stack.push(node);
    }
  };

  Object.keys(graph).forEach(visit);

  return stack;
};

const sortedPrograms = topologicalSort(dependencyTree);

// Write the compiledPrograms.ts file
const compiledProgramsPath = path.join('.', 'src', 'compiledPrograms.ts');
const compiledProgramsContent = `
/*** GENERATED FILE - DO NOT EDIT ***/
/*** This is generated by the copyFiles.js script ***/

export const pondoPrograms = ${JSON.stringify(sortedPrograms, null, 2)};

export const pondoDependencyTree: { [key: string]: string[] } = ${JSON.stringify(
  dependencyTree,
  null,
  2
)};

export const pondoProgramToCode: { [key: string]: string } = ${JSON.stringify(
  pondoProgramToCode,
  null,
  2
)};
`;

fs.writeFileSync(compiledProgramsPath, compiledProgramsContent.trim());
console.log(`Created ${compiledProgramsPath}`);
