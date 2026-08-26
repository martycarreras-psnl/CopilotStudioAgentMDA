"""Provision the approved Agent Sidecar administration schema idempotently.

The script targets the environment configured by ``scripts/auth.py`` and puts
every created component in the HRAgentSidecar solution. It creates only the
administration choices, tables, columns, relationship, status reasons, and
alternate keys approved in ``dataverse/planning-payload.json``.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from auth import get_client, get_plugin_headers, get_token, load_env


SOLUTION = "HRAgentSidecar"
LANGUAGE_CODE = 1033

CHOICES = (
    {
        "name": "maftagsc_sidecarhealthstate",
        "display_name": "Sidecar Health State",
        "options": (
            (100000000, "Not Validated"),
            (100000001, "Healthy"),
            (100000002, "Warning"),
            (100000003, "Critical"),
        ),
    },
    {
        "name": "maftagsc_bindingvalidationstate",
        "display_name": "Binding Validation State",
        "options": (
            (100000000, "Not Validated"),
            (100000001, "Pass"),
            (100000002, "Warning"),
            (100000003, "Conflict"),
        ),
    },
)


def label(text: str) -> dict[str, Any]:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        "LocalizedLabels": [
            {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                "Label": text,
                "LanguageCode": LANGUAGE_CODE,
            }
        ],
    }


def required(value: str) -> dict[str, str]:
    return {"Value": value}


def string_column(schema_name: str, display_name: str, max_length: int, required_level: str) -> dict[str, Any]:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "SchemaName": schema_name,
        "DisplayName": label(display_name),
        "RequiredLevel": required(required_level),
        "MaxLength": max_length,
        "FormatName": {"Value": "Text"},
    }


def memo_column(schema_name: str, display_name: str, max_length: int, required_level: str) -> dict[str, Any]:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "SchemaName": schema_name,
        "DisplayName": label(display_name),
        "RequiredLevel": required(required_level),
        "MaxLength": max_length,
        "Format": "Text",
    }


def integer_column(schema_name: str, display_name: str, required_level: str) -> dict[str, Any]:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        "SchemaName": schema_name,
        "DisplayName": label(display_name),
        "RequiredLevel": required(required_level),
        "MinValue": -2147483648,
        "MaxValue": 2147483647,
        "Format": "None",
    }


def boolean_column(schema_name: str, display_name: str, default_value: bool, required_level: str) -> dict[str, Any]:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        "SchemaName": schema_name,
        "DisplayName": label(display_name),
        "RequiredLevel": required(required_level),
        "DefaultValue": default_value,
        "OptionSet": {
            "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
            "TrueOption": {"Value": 1, "Label": label("Yes")},
            "FalseOption": {"Value": 0, "Label": label("No")},
        },
    }


def datetime_column(schema_name: str, display_name: str, required_level: str) -> dict[str, Any]:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "SchemaName": schema_name,
        "DisplayName": label(display_name),
        "RequiredLevel": required(required_level),
        "Format": "DateAndTime",
        "DateTimeBehavior": {"Value": "UserLocal"},
    }


def picklist_column(
    schema_name: str,
    display_name: str,
    required_level: str,
    option_set_metadata_id: str,
) -> dict[str, Any]:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        "SchemaName": schema_name,
        "DisplayName": label(display_name),
        "RequiredLevel": required(required_level),
        "GlobalOptionSet@odata.bind": f"/GlobalOptionSetDefinitions({option_set_metadata_id})",
    }


class DataverseMetadataApi:
    def __init__(self) -> None:
        load_env()
        base_url = os.environ["DATAVERSE_URL"].rstrip("/")
        self.api_url = f"{base_url}/api/data/v9.2"
        self.headers = get_plugin_headers("dv-metadata", get_token())
        self.headers.update(
            {
                "Accept": "application/json",
                "Content-Type": "application/json; charset=utf-8",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
                "MSCRM.SolutionUniqueName": SOLUTION,
            }
        )

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            f"{self.api_url}/{path.lstrip('/')}",
            data=data,
            headers=self.headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Dataverse {method} {path} failed ({error.code}): {body}") from error

    def get_choice(self, name: str) -> dict[str, Any] | None:
        encoded_name = name.replace("'", "''")
        try:
            return self.request(
                "GET",
                f"GlobalOptionSetDefinitions(Name='{encoded_name}')/"
                "Microsoft.Dynamics.CRM.OptionSetMetadata?"
                "$select=MetadataId,Name,Options",
            )
        except RuntimeError as error:
            if "(404)" in str(error):
                return None
            raise

    def wait_for_choice(self, name: str, attempts: int = 12) -> dict[str, Any] | None:
        for attempt in range(attempts):
            existing = self.get_choice(name)
            if existing is not None:
                return existing
            if attempt < attempts - 1:
                time.sleep(5)
        return None

    def ensure_choice(self, definition: dict[str, Any]) -> str:
        existing = self.get_choice(definition["name"])
        if existing is None:
            payload = {
                "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
                "Name": definition["name"],
                "DisplayName": label(definition["display_name"]),
                "Description": label(f"Agent Sidecar {definition['display_name']} values."),
                "IsGlobal": True,
                "OptionSetType": "Picklist",
                "Options": [
                    {"Value": value, "Label": label(option_label)}
                    for value, option_label in definition["options"]
                ],
            }
            self.request("POST", "GlobalOptionSetDefinitions", payload)
            print(f"Created choice: {definition['name']}", flush=True)
            existing = self.wait_for_choice(definition["name"])
            if existing is None:
                raise RuntimeError(f"Choice {definition['name']} was created but could not be read back.")
        else:
            print(f"Reusing choice: {definition['name']}", flush=True)

        existing_values = {option["Value"] for option in existing.get("Options", [])}
        for value, option_label in definition["options"]:
            if value in existing_values:
                continue
            self.request(
                "POST",
                "InsertOptionValue",
                {
                    "OptionSetName": definition["name"],
                    "Value": value,
                    "Label": label(option_label),
                    "SolutionUniqueName": SOLUTION,
                },
            )
            print(f"  Added option {value}: {option_label}", flush=True)
        return existing["MetadataId"]

    def get_table(self, logical_name: str) -> dict[str, Any] | None:
        try:
            return self.request(
                "GET",
                f"EntityDefinitions(LogicalName='{logical_name}')?"
                "$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute",
            )
        except RuntimeError as error:
            if "(404)" in str(error):
                return None
            raise

    def wait_for_table(self, logical_name: str, attempts: int = 12) -> dict[str, Any] | None:
        for attempt in range(attempts):
            existing = self.get_table(logical_name)
            if existing is not None:
                return existing
            if attempt < attempts - 1:
                time.sleep(5)
        return None

    def ensure_table(self, definition: dict[str, Any]) -> str:
        logical_name = definition["logical_name"]
        existing = self.get_table(logical_name)
        if existing is not None:
            print(f"Reusing table: {logical_name}", flush=True)
            return existing["MetadataId"]

        payload = {
            "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
            "SchemaName": definition["schema_name"],
            "DisplayName": label(definition["display_name"]),
            "DisplayCollectionName": label(definition["collection_name"]),
            "Description": label(definition["description"]),
            "OwnershipType": "OrganizationOwned",
            "IsActivity": False,
            "HasActivities": False,
            "HasNotes": False,
            "PrimaryNameAttribute": "maftagsc_name",
            "Attributes": definition["attributes"],
        }
        try:
            self.request("POST", "EntityDefinitions", payload)
            print(f"Created table: {logical_name}", flush=True)
        except RuntimeError as error:
            if "0x80044363" not in str(error) and "same name already exists" not in str(error):
                raise
            print(f"Reusing table pending metadata publication: {logical_name}", flush=True)
            return ""
        existing = self.wait_for_table(logical_name)
        if existing is None:
            raise RuntimeError(f"Table {logical_name} was created but could not be read back.")
        return existing["MetadataId"]

    def relationship_exists(self, schema_name: str) -> bool:
        query = urllib.parse.quote(f"SchemaName eq '{schema_name}'", safe="'_")
        result = self.request("GET", f"RelationshipDefinitions?$select=SchemaName&$filter={query}")
        return bool(result.get("value"))

    def ensure_relationship(self) -> None:
        schema_name = "maftagsc_sidecarconfiguration_targetbinding"
        if self.relationship_exists(schema_name):
            print(f"Reusing relationship: {schema_name}", flush=True)
            return
        self.request(
            "POST",
            "RelationshipDefinitions",
            {
                "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                "SchemaName": schema_name,
                "ReferencedEntity": "maftagsc_sidecarconfiguration",
                "ReferencingEntity": "maftagsc_targetbinding",
                "ReferencedAttribute": "maftagsc_sidecarconfigurationid",
                "CascadeConfiguration": {
                    "Assign": "NoCascade",
                    "Delete": "Cascade",
                    "Merge": "NoCascade",
                    "Reparent": "NoCascade",
                    "Share": "NoCascade",
                    "Unshare": "NoCascade",
                    "RollupView": "NoCascade",
                },
                "Lookup": {
                    "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                    "SchemaName": "maftagsc_sidecarconfiguration",
                    "DisplayName": label("Sidecar Configuration"),
                    "RequiredLevel": required("ApplicationRequired"),
                },
            },
        )
        print(f"Created relationship: {schema_name}", flush=True)

    def get_status_options(self, table: str) -> set[int]:
        result = self.request(
            "GET",
            f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='statuscode')/"
            "Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&"
            "$expand=OptionSet($select=Options)",
        )
        return {option["Value"] for option in result.get("OptionSet", {}).get("Options", [])}

    def ensure_status_reasons(self, table: str, reasons: tuple[tuple[int, str, int], ...]) -> None:
        existing_values = self.get_status_options(table)
        for value, option_label, state_code in reasons:
            if value in existing_values:
                continue
            self.request(
                "POST",
                "InsertStatusValue",
                {
                    "EntityLogicalName": table,
                    "AttributeLogicalName": "statuscode",
                    "StateCode": state_code,
                    "Value": value,
                    "Label": label(option_label),
                    "SolutionUniqueName": SOLUTION,
                },
            )
            print(f"  Added {table} status reason {value}: {option_label}", flush=True)

    def publish(self) -> None:
        self.request("POST", "PublishAllXml", {})
        print("Published all customizations.", flush=True)


def table_definitions(choice_ids: dict[str, str]) -> tuple[dict[str, Any], ...]:
    primary_configuration = string_column(
        "maftagsc_name", "Configuration Name", 200, "ApplicationRequired"
    )
    primary_configuration["IsPrimaryName"] = True
    primary_binding = string_column("maftagsc_name", "Binding Name", 300, "ApplicationRequired")
    primary_binding["IsPrimaryName"] = True

    return (
        {
            "schema_name": "maftagsc_sidecarconfiguration",
            "logical_name": "maftagsc_sidecarconfiguration",
            "display_name": "Sidecar Configuration",
            "collection_name": "Sidecar Configurations",
            "description": "Desired state for one app-keyed Agent Sidecar.",
            "attributes": [
                primary_configuration,
                string_column("maftagsc_appid", "Model-driven App ID", 36, "ApplicationRequired"),
                string_column("maftagsc_appuniquename", "App Unique Name", 256, "ApplicationRequired"),
                string_column("maftagsc_appdisplayname", "App Display Name", 256, "ApplicationRequired"),
                string_column("maftagsc_panetitle", "Pane Title", 256, "ApplicationRequired"),
                integer_column("maftagsc_panewidth", "Pane Width", "ApplicationRequired"),
                string_column("maftagsc_agentdisplayname", "Agent Display Name", 256, "ApplicationRequired"),
                string_column("maftagsc_agentschemaname", "Agent Schema Name", 256, "ApplicationRequired"),
                memo_column("maftagsc_agentconnectionstring", "Agents SDK Connection String", 4000, "ApplicationRequired"),
                string_column("maftagsc_tenantid", "Tenant ID", 36, "ApplicationRequired"),
                string_column("maftagsc_publicclientapplicationid", "Public Client Application ID", 36, "ApplicationRequired"),
                string_column("maftagsc_environmentid", "Environment ID", 36, "ApplicationRequired"),
                string_column("maftagsc_bindingsolutionuniquename", "Target Binding Solution", 256, "ApplicationRequired"),
                boolean_column("maftagsc_autoenablenewtables", "Propose New Tables", True, "ApplicationRequired"),
                picklist_column("maftagsc_healthstate", "Health State", "ApplicationRequired", choice_ids["maftagsc_sidecarhealthstate"]),
                datetime_column("maftagsc_lastvalidatedat", "Last Validated At", "None"),
                memo_column("maftagsc_lastoperationsummary", "Last Operation Summary", 4000, "None"),
            ],
        },
        {
            "schema_name": "maftagsc_targetbinding",
            "logical_name": "maftagsc_targetbinding",
            "display_name": "Target Binding",
            "collection_name": "Target Bindings",
            "description": "One sidecar-owned table and form registration.",
            "attributes": [
                primary_binding,
                string_column("maftagsc_tablelogicalname", "Table Logical Name", 128, "ApplicationRequired"),
                string_column("maftagsc_tabledisplayname", "Table Display Name", 256, "ApplicationRequired"),
                string_column("maftagsc_formid", "Form ID", 36, "ApplicationRequired"),
                string_column("maftagsc_formname", "Form Name", 256, "ApplicationRequired"),
                boolean_column("maftagsc_enabled", "Enabled", True, "ApplicationRequired"),
                string_column("maftagsc_handleruniqueid", "Handler Unique ID", 36, "ApplicationRequired"),
                string_column("maftagsc_originalformfingerprint", "Original Form Fingerprint", 128, "None"),
                string_column("maftagsc_lastappliedfingerprint", "Last Applied Fingerprint", 128, "None"),
                picklist_column("maftagsc_validationstate", "Validation State", "ApplicationRequired", choice_ids["maftagsc_bindingvalidationstate"]),
            ],
        },
    )


def ensure_alternate_key(client: Any, table: str, key_name: str, columns: list[str], display_name: str) -> None:
    existing = client.tables.get_alternate_keys(table)
    if any(key.schema_name.lower() == key_name.lower() for key in existing):
        print(f"Reusing alternate key: {key_name}", flush=True)
        return
    client.tables.create_alternate_key(table, key_name, columns, display_name=display_name)
    print(f"Created alternate key: {key_name}", flush=True)


def remove_obsolete_alternate_key(client: Any, table: str, key_name: str) -> None:
    existing = next(
        (
            key
            for key in client.tables.get_alternate_keys(table)
            if key.schema_name == key_name
        ),
        None,
    )
    if existing is None:
        return

    client.tables.delete_alternate_key(table, existing.metadata_id)
    for _ in range(30):
        if all(
            key.schema_name != key_name
            for key in client.tables.get_alternate_keys(table)
        ):
            return
        time.sleep(2)
    raise RuntimeError(f"Timed out deleting obsolete alternate key {key_name}.")


def main() -> None:
    api = DataverseMetadataApi()
    sdk_client = get_client("dv-metadata")

    print(f"Provisioning solution {SOLUTION} in {api.api_url.removesuffix('/api/data/v9.2')}", flush=True)
    choice_ids = {choice["name"]: api.ensure_choice(choice) for choice in CHOICES}

    for table in table_definitions(choice_ids):
        api.ensure_table(table)

    # Newly-created entity metadata can remain invisible by logical name until published.
    api.publish()

    # Force metadata cache refresh before dependent operations.
    for table in ("maftagsc_sidecarconfiguration", "maftagsc_targetbinding"):
        api.get_table(table)

    api.ensure_relationship()

    remove_obsolete_alternate_key(
        sdk_client,
        "maftagsc_sidecarconfiguration",
        "maftagsc_sidecarconfiguration_appid_key",
    )
    ensure_alternate_key(
        sdk_client,
        "maftagsc_targetbinding",
        "maftagsc_targetbinding_form_key",
        ["maftagsc_sidecarconfiguration", "maftagsc_formid"],
        "Target Binding Configuration and Form",
    )

    api.ensure_status_reasons(
        "maftagsc_sidecarconfiguration",
        (
            (703600000, "Draft", 0),
            (703600001, "Deployed", 0),
            (703600002, "Drift Detected", 0),
            (703600003, "Disabled", 1),
        ),
    )
    api.publish()

    # Read back key status after publication without blocking indefinitely on index creation.
    for table in ("maftagsc_sidecarconfiguration", "maftagsc_targetbinding"):
        statuses = [f"{key.schema_name}={key.status}" for key in sdk_client.tables.get_alternate_keys(table)]
        print(f"Alternate keys for {table}: {', '.join(statuses)}", flush=True)


if __name__ == "__main__":
    main()