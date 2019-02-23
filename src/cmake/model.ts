interface Target {
  name: string;
  type: string;
  sourceDirectory: string;

  compileGroups: {
    language: string;
    compilerPath: string;
    compileFlags: string;
    sources: string[];
    defines: string[];
    includePaths: {
      path: string;
    }[];
  }[];
}

interface Project {
  name: string;
  targets: Target[];
}

interface CacheValue {
  value: string;
}

export { Target, Project, CacheValue };