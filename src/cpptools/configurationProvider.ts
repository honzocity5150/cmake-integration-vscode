import {Uri} from 'vscode';
import {CancellationToken} from 'vscode-jsonrpc';
import {CustomConfigurationProvider, SourceFileConfiguration, SourceFileConfigurationItem, WorkspaceBrowseConfiguration} from 'vscode-cpptools';
import {CodeModel, Project, Target} from '../cmake/protocol';
import { CMakeClient } from '../cmake/client';
import * as path from 'path';

class ConfigurationProvider implements CustomConfigurationProvider {
  
  name: string;  
  extensionId: string;

  private sourceFiles : Map<string, SourceFileConfigurationItem> = new Map();
  private clientFiles : Map<CMakeClient, string[]> = new Map();

  constructor() {
    this.name = "CMake Configuration";
    this.extensionId = "go2sh.cmake-integration";
  }

  updateModel(workspace : Uri, codeModel : CodeModel) {
    let projects = codeModel.configurations[0].projects;

    projects.forEach((project) => {
      project.targets.forEach((target) => {
        target.fileGroups.filter((fg) => fg.language === "C" || fg.language === "CXX").forEach((fg) => {
          let filePath = path.join(project.sourceDirectory, fg)
          let item : SourceFileConfigurationItem = {
            uri: Uri.file()
          }
          this.sourceFiles.set()
        })
      });
    });
  }

  canProvideConfiguration(uri: Uri, token?: CancellationToken): Thenable<boolean> {
    console.log(uri.toString());
    return Promise.resolve(false);
  }
 
  provideConfigurations(uris: Uri[], token?: CancellationToken): Thenable<SourceFileConfigurationItem[]> {
    console.log(uris);
    return Promise.resolve([]);
  }

  canProvideBrowseConfiguration(token?: CancellationToken): Thenable<boolean> {
    return Promise.resolve(false);
  }

  provideBrowseConfiguration(token?: CancellationToken): Thenable<WorkspaceBrowseConfiguration> {
    let asd : SourceFileConfiguration = {
      compilerPath: "",
      defines: [],
      includePath: [],
      intelliSenseMode: "msvc-x64",
      standard: "c++17"
    };
    asd;
    return Promise.resolve({} as WorkspaceBrowseConfiguration);
  }

  dispose() {
    
  }

}

export { ConfigurationProvider };