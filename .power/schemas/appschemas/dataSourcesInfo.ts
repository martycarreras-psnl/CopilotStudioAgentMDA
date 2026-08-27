/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "addsolutioncomponent": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "AddSolutionComponent": {
        "path": "/api/data/v9.2/AddSolutionComponent",
        "method": "POST",
        "parameters": [
          {
            "name": "ComponentId",
            "in": "body",
            "required": true,
            "type": "string"
          },
          {
            "name": "ComponentType",
            "in": "body",
            "required": true,
            "type": "number"
          },
          {
            "name": "SolutionUniqueName",
            "in": "body",
            "required": true,
            "type": "string"
          },
          {
            "name": "AddRequiredComponents",
            "in": "body",
            "required": true,
            "type": "boolean"
          },
          {
            "name": "DoNotIncludeSubcomponents",
            "in": "body",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "IncludedComponentSettingsValues",
            "in": "body",
            "required": false,
            "type": "array"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  },
  "bots": {
    "tableId": "",
    "version": "",
    "primaryKey": "botid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "appmodulecomponents": {
    "tableId": "",
    "version": "",
    "primaryKey": "appmodulecomponentid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "entities": {
    "tableId": "",
    "version": "",
    "primaryKey": "entityid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "appmodules": {
    "tableId": "",
    "version": "",
    "primaryKey": "appmoduleid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "publishers": {
    "tableId": "",
    "version": "",
    "primaryKey": "publisherid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "roles": {
    "tableId": "",
    "version": "",
    "primaryKey": "roleid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "maftagsc_sidecarconfigurations": {
    "tableId": "",
    "version": "",
    "primaryKey": "maftagsc_sidecarconfigurationid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "publishxml": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "PublishXml": {
        "path": "/api/data/v9.2/PublishXml",
        "method": "POST",
        "parameters": [
          {
            "name": "ParameterXml",
            "in": "body",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          }
        }
      }
    }
  },
  "solutions": {
    "tableId": "",
    "version": "",
    "primaryKey": "solutionid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "systemforms": {
    "tableId": "",
    "version": "",
    "primaryKey": "formid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "systemuserrolescollection": {
    "tableId": "",
    "version": "",
    "primaryKey": "systemuserroleid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "maftagsc_targetbindings": {
    "tableId": "",
    "version": "",
    "primaryKey": "maftagsc_targetbindingid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "systemusers": {
    "tableId": "",
    "version": "",
    "primaryKey": "systemuserid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "webresourceset": {
    "tableId": "",
    "version": "",
    "primaryKey": "webresourceid",
    "dataSourceType": "Dataverse",
    "apis": {}
  }
};
