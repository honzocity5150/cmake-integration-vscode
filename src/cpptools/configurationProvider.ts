import {Uri, WorkspaceConfiguration} from 'vscode';
import {CancellationToken} from 'vscode-jsonrpc';
import {CustomConfigurationProvider, SourceFileConfiguration, SourceFileConfigurationItem, WorkspaceBrowseConfiguration} from 'vscode-cpptools';
import {CodeModel} from '../cmake/protocol';
import { CMakeClient } from '../cmake/client';
import * as path from 'path';
import * as vscode from 'vscode';

class ConfigurationProvider implements CustomConfigurationProvider {
  
  name: string = "CMake Integration" ;  
  extensionId: string = "go2sh.cmake-integration";

  private clients : Set<CMakeClient> = new Set();
  private browseConfig : WorkspaceBrowseConfiguration | undefined;
  private sourceFiles : Map<string, SourceFileConfigurationItem> = new Map();
  private clientFiles : Map<CMakeClient, string[]> = new Map();

  constructor() {
    this.browseConfig = {
      browsePath: [],
      compilerPath: "",
      standard: "c++17",
      windowsSdkVersion: "12"
    };
  }

  updateModel(workspace : Uri, codeModel : CodeModel) {
    let projects = codeModel.configurations[0].projects;


    projects.forEach((project) => {
      project.targets.forEach((target) => {
        let cFileGroups = target.fileGroups.filter((fg) => fg.language === "C" || fg.language === "CXX");
        cFileGroups.forEach((fg) => {
          fg.sources.forEach((file) => {
            let filePath = path.normalize(path.join(project.sourceDirectory, file));
            let item : SourceFileConfigurationItem = {
              uri: Uri.file(filePath),
              configuration: {
                includePath: fg.includePath.map((value) => value.path),
                defines: fg.defines,
                intelliSenseMode: "msvc-x64",
                standard: "c++17"
              }
            };
            this.sourceFiles.set(filePath, item);
          });

        });
      });
    });
  }

  canProvideConfiguration(uri: Uri, token?: CancellationToken): Thenable<boolean> {
    return Promise.resolve(this.sourceFiles.has(uri.fsPath));
  }
 
  provideConfigurations(uris: Uri[], token?: CancellationToken): Thenable<SourceFileConfigurationItem[]> {
    return Promise.resolve(uris.map((uri) => this.sourceFiles.get(uri.fsPath)!));
  }

  canProvideBrowseConfiguration(token?: CancellationToken): Thenable<boolean> {
    return Promise.resolve(this.browseConfig !== undefined);
  }

  provideBrowseConfiguration(token?: CancellationToken): Thenable<WorkspaceBrowseConfiguration> {
    return Promise.resolve(this.browseConfig!);
  }

  dispose() {
    
  }

}

export { ConfigurationProvider };