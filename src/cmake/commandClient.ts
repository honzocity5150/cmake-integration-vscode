/*
 * Copyright 2019 Christoph Seitz
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

/*
 * CMake Client based on running cmake process with file api
 */
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

import { CMake } from "./cmake";
import { LineTransform } from '../helpers/stream';
import { getProblemMatchers, CMakeMatcher } from '../helpers/problemMatcher';
import { makeRecursivDirectory } from '../helpers/fs';
import { IndexFile, CodeModelFile, ClientResponse, ReplyFileReference, TargetFile, CacheFile } from './fileApi';
import { Target, Project, CacheValue } from './model';

const stat = promisify(fs.stat);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

class CommandClient extends CMake {

  constructor(
    sourceFolder: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder,
    extensionContext: vscode.ExtensionContext
  ) {
    super(sourceFolder, workspaceFolder, extensionContext);
    this.readFileApiReply();
  }

  /* 
   * Interface 
   */

  async regenerateBuildDirectory() {
    await makeRecursivDirectory(this.buildDirectory);
  }

  async configure(): Promise<void> {
    let cmakePath = vscode.workspace.getConfiguration("cmake", this.sourceUri).get("cmakePath", "cmake");
    let args: string[] = [];
    let matcher = new CMakeMatcher(this.buildDirectory);

    args.push("-G"+this.generator);
    if (!this.isConfigurationGenerator) {
      args.push("-DCMAKE_BUILD_TYPE=", this.buildType);
    }
    if (this.toolchainFile) {
      args.push("-DCMAKE_TOOLCHAIN_FILE=" + this.toolchainFile);
    }
    for (const key in this.variables) {
      args.push("-D" + key + "=" + this.variables);
    }
    args.push(this.sourceUri.fsPath);

    this.makeFileApiRequest();

    let buildProc = child_process.execFile(cmakePath, args, {
      cwd: this.buildDirectory,
      env: this.environment
    });
    buildProc.stdout.pipe(new LineTransform()).on("data", (chunk: string) => {
      this.console.appendLine(chunk);
      matcher.match(chunk);
    });
    buildProc.stderr.pipe(new LineTransform()).on("data", (chunk: string) => {
      this.console.appendLine(chunk);
      matcher.match(chunk);
    });

    this.mayShowConsole();

    return new Promise((resolve, reject) => {
      let error = false;
      buildProc.on("error", (err) => {
        error = true;
        reject(err);
      });
      buildProc.on("exit", (code, signal) => {
        this.diagnostics.set(matcher.getDiagnostics());
        this.readFileApiReply().then(() => {
          if (!error) {
            resolve();
          }
        }).catch((e) => reject(e));
      });
    });
  }

  async build(target?: string): Promise<void> {
    let cmakePath = vscode.workspace.getConfiguration("cmake", this.sourceUri).get("cmakePath", "cmake");
    let args: string[] = [];
    let matchers = getProblemMatchers(this.buildDirectory);

    args.push("--build", this.buildDirectory);
    if (target) {
      args.push("--target", target);
    }
    if (this.isConfigurationGenerator) {
      args.push("--config", this.buildType);
    }

    let buildProc = child_process.execFile(cmakePath, args, {
      env: this.environment
    });
    buildProc.stdout.pipe(new LineTransform()).on("data", (chunk: string) => {
      this.console.appendLine(chunk);
      matchers.forEach((matcher) => matcher.match(chunk));
    });
    buildProc.stderr.pipe(new LineTransform()).on("data", (chunk: string) => {
      this.console.appendLine(chunk);
      matchers.forEach((matcher) => matcher.match(chunk));
    });

    this.mayShowConsole();

    return new Promise((resolve, reject) => {
      let error = false;
      buildProc.on("error", (err) => {
        error = true;
        reject(err);
      });
      buildProc.on("exit", (code, signal) => {
        this.diagnostics.set(
          matchers.reduce((previous, current) =>
            previous.concat(current.getDiagnostics()),
            [] as [vscode.Uri, vscode.Diagnostic[] | undefined][])
        );
        if (!error) {
          resolve();
        }
      });
    });
  }

  public dispose(): void {
    super.dispose();
  }

  /*
   * Private methods 
   */

  private get requestFolder(): string {
    return path.join(this.buildDirectory, ".cmake", "api", "v1", "query", "client-integration-vscode");
  }

  private async makeFileApiRequest() {
    let requests = [
      "codemodel-v2",
      "cache-v2",
      "cmakeFiles-v1"
    ];
    let res = await makeRecursivDirectory(this.requestFolder);

    if (!res) {
      let entries = await readdir(this.requestFolder);
      for (const entry of entries) {
        if (requests.indexOf(entry) === - 1) {
          await unlink(path.join(this.requestFolder, entry));
        }
      }
    }

    for (const request of requests) {
      let requestPath = path.join(this.requestFolder, request);
      let result = await stat(requestPath).catch((e) => undefined);
      if (!result) {
        await writeFile(
          requestPath, "", { flag: "w" }
        );
      }
    }
  }

  private get replyFolder(): string {
    return path.join(this.buildDirectory, ".cmake", "api", "v1", "reply");
  }

  private async readFileApiReply() {
    let res = await stat(this.replyFolder).catch((e) => undefined);
    if (!res || !res.isDirectory) {
      return;
    }

    let files = await readdir(this.replyFolder);
    let indexFile = files.filter((value) => {
      if (value.match(/^index.+\.json$/)) {
        return value;
      }
    }).sort().pop();
    if (!indexFile) {
      return;
    }
    let index: IndexFile = JSON.parse(
      await readFile(path.join(this.replyFolder, indexFile), { encoding: 'utf-8' })
    );
    let clientResponse: ClientResponse = <ClientResponse>index.reply["client-integration-vscode"];
    let codeModelFile: ReplyFileReference = <ReplyFileReference>clientResponse["codemodel-v2"];
    let codeModel: CodeModelFile = JSON.parse(
      await readFile(
        path.join(this.replyFolder, codeModelFile.jsonFile),
        { encoding: 'utf-8' })
    );

    let cacheFile: ReplyFileReference = <ReplyFileReference>clientResponse["cache-v2"];
    let cache: CacheFile = JSON.parse(
      await readFile(
        path.join(this.replyFolder, cacheFile.jsonFile),
        { encoding: 'utf-8' }
      )
    );

    this.cache.clear();
    for (const entry of cache.entries) {
      this.cache.set(entry.name, entry as CacheValue);
    }

    await this.buildModel(index, codeModel);
    this.selectContext();
    this._onModelChange.fire(this);
  }

  private async buildModel(indexFile: IndexFile, codeModel: CodeModelFile) {
    this._projects = [];
    this._targets = [];

    for (const projectEntry of codeModel.configurations[0].projects) {
      let project: Project = {
        name: projectEntry.name,
        targets: []
      };

      for (const index of projectEntry.targetIndexes) {
        let targetEntry = codeModel.configurations[0].targets[index];
        let targetFile = JSON.parse(await readFile(path.join(this.replyFolder, targetEntry.jsonFile), { encoding: 'utf-8' })) as TargetFile;
        let target: Target = {
          name: targetEntry.name,
          type: targetFile.type,
          sourceDirectory: path.join(codeModel.paths.source, targetFile.paths.source),
          compileGroups: []
        };
        if (targetFile.compileGroups) {
          for (const cg of targetFile.compileGroups) {
            let modeCg: Target['compileGroups'][0] = {
              compileFlags: "",
              compilerPath: "",
              defines: [],
              includePaths: [],
              language: cg.language,
              sources: cg.sourceIndexes.map((index) => targetFile.sources[index].path)
            };
            if (cg.defines) {
              modeCg.defines = cg.defines.map((def) => def.define);
            }
            if (cg.includes) {
              modeCg.includePaths = cg.includes.map((inc) => {
                return { path: inc.path };
              });
            }
            target.compileGroups.push(modeCg);
          }
        }
        this._targets.push(target);
        project.targets.push(target);
      }
      this._projects.push(project);
    }
  }
}

export { CommandClient };