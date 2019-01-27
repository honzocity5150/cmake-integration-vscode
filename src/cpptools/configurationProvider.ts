import { Uri, WorkspaceConfiguration } from 'vscode';
import { CancellationToken } from 'vscode-jsonrpc';
import { CustomConfigurationProvider, SourceFileConfiguration, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { CodeModel } from '../cmake/protocol';
import { CMakeClient } from '../cmake/client';
import * as path from 'path';
import * as vscode from 'vscode';

class ConfigurationProvider implements CustomConfigurationProvider {

  name: string = "CMake Integration";
  extensionId: string = "go2sh.cmake-integration";

  private clients: Set<CMakeClient> = new Set();
  private browseConfig: WorkspaceBrowseConfiguration | undefined;
  private sourceFiles: Map<string, SourceFileConfigurationItem> = new Map();
  private clientFiles: Map<CMakeClient, string[]> = new Map();

  constructor() {
    this.browseConfig = {
      browsePath: []
    };
  }

  static getStandard(compiler: string, args: string, language? : "c" | "c++" ) : string {
    let gccMatch = /\/?[^/]*g(?cc|\+\+)[^/]$/;
    let gccStdMatch = /-std=((?:iso9899\:|(?:(?:gnu|c)(?:\+\+)?))\w+)/;
    let gccStdLookup : {[key: string] : string} = {
      "c89": "c89",
      "c90": "c99",
      "iso9899:1990": "c99",
      "iso9899:199409": "c99",
      "c99": "c99",
      "c9x": "c99",
      "iso9899:1999": "c99",
      "iso9899:199x": "c99",
      "c11": "c11",
      "c1x": "c11",
      "iso9899:2011": "c11",
      "c17": "c11", // Not supported by c/c++ extension
      "c18": "c11", // Not supported by c/c++ extension
      "iso9899:2017": "c11", // Not supported by c/c++ extension
      "iso9899:2018": "c11", // Not supported by c/c++ extension
      "gnu89": "c89",
      "gnu90": "c99",
      "gnu99": "c99",
      "gnu9x": "c99",
      "gnu11": "c11",
      "gnu1x": "c11", 
      "gnu17": "c11", // Not supported by c/c++ extension
      "gnu18": "c11",  // Not supported by c/c++ extension
      "c++98": "c++98",
      "c++03": "c++03",
      "gnu++98": "c++98",
      "gnu++03": "c++03",
      "c++11": "c++11",
      "c++0x": "c++11",
      "gnu++11": "c++11",
      "gnu++0x": "c++11",
      "c++14": "c++14",
      "c++1y": "c++14",
      "gnu++14": "c++14",
      "gnu++1y": "c++14",
      "c++17": "c++17",
      "c++1z": "c++17",
      "gnu++17": "c++17",
      "gnu++1z": "c++17",
      "c++2a": "c++17",
      "gnu++2a": "c++17" // Not supported by c/c++ extension
    };

    let clMatch = /cl\.exe/;
    let clStdMatch = /\/Std\:(c\+\+\w+)/;
    let clStdLookup : {[key : string] : string} = {
      "c++14": "c++14",
      "c++17": "c++17",
      "c++latest": "c++17" // Not supported by c/c++ extension
    };

    if (gccMatch.exec(compiler)) {
      let stdResult = gccStdMatch.exec(args);
      if (stdResult) {
        return gccStdLookup[stdResult[1]];
      } else {
        if (language === "c") {
          return "c11";
        } else {
          return "c++14";
        }
      }
    }

    if (clMatch.exec(compiler)) {
      let stdResult = clStdMatch.exec(args);
      if (stdResult) {
        return clStdLookup[stdResult[1]]
      } else {
        if (language === "c") {
          return "c89";
        } else {
          return "c++14";
        }
      }
    }

    return "c++17";
  }

  updateModel(workspace: Uri, codeModel: CodeModel) {
    let projects = codeModel.configurations[0].projects;


    projects.forEach((project) => {
      project.targets.forEach((target) => {
        let cFileGroups = target.fileGroups.filter((fg) => fg.language === "C" || fg.language === "CXX");
        cFileGroups.forEach((fg) => {
          fg.sources.forEach((file) => {
            let filePath = path.normalize(path.join(project.sourceDirectory, file));
            let item: SourceFileConfigurationItem = {
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

  deleteClient(client : CMakeClient) {
    let files = this.clientFiles.get(client)!;
    // Remove from source files
    files.forEach((value) => this.sourceFiles.delete(value));
    // Remove from cache
    this.clientFiles.delete(client);
    this.clients.delete(client);
    this._updateBrowsingConfiguration();
  }

  private _updateBrowsingConfiguration() {

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