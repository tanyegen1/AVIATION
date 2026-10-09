"""Generates the synthetic demo PDFs and the matching demo_fixtures.json
(simulated AI extraction output, keyed by file sha256) and
expected_results.json (independent ground truth used by tests).

Run with: python fixtures/generate_fixtures.py  (from backend/)

These PDFs contain no real customer data, aircraft, or company branding -
every name, registration, part number, and organization below is invented
for this demo only.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
PDFS_DIR = HERE / "pdfs"
PDFS_DIR.mkdir(exist_ok=True)


def make_pdf(filename: str, title: str, lines: list[str]) -> bytes:
    path = PDFS_DIR / filename
    c = canvas.Canvas(str(path), pagesize=LETTER)
    width, height = LETTER

    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(0.7, 0.1, 0.1)
    c.drawString(40, height - 40, "SYNTHETIC DEMO DOCUMENT - NOT A REAL AIRCRAFT RECORD")
    c.setFillColorRGB(0, 0, 0)

    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, height - 70, title)

    c.setFont("Helvetica", 10)
    y = height - 100
    for line in lines:
        if y < 60:
            c.showPage()
            y = height - 60
        c.drawString(40, y, line)
        y -= 16

    c.save()
    content = path.read_bytes()
    return content


def sha256_of(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def field(field_name, qualifier=None, raw=None, normalized=None, page=1, evidence=None, confidence="high"):
    return {
        "field_name": field_name,
        "qualifier": qualifier,
        "raw_value": raw,
        "normalized_value": normalized,
        "page_number": page,
        "evidence_text": evidence,
        "self_reported_confidence": confidence,
    }


def page_result(category, fields, confidence="high", scanned=False, notes=None):
    return {
        "document_category_guess": category,
        "category_confidence": confidence,
        "page_is_scanned_image": scanned,
        "fields": fields,
        "notes": notes,
    }


def main() -> None:
    demo_fixtures: dict[str, dict] = {}
    expected_results: dict[str, dict] = {}

    # --- Scenario A: consistent, matching record pair -----------------
    content = make_pdf(
        "A1_status_sheet.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-A1234",
            "Part Number: PN-1000-A",
            "Serial Number: SN-100234",
            "Component Description: Hydraulic Pump Assembly",
            "Status Date: 2024-01-10",
            "Flight Hours: 1500 (since new)",
            "Flight Cycles: 980 (since new)",
            "Organization: Meridian Technical Records Ltd.",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": page_result(
                "component_status_sheet",
                [
                    field("aircraft_registration", raw="N-A1234", normalized="N-A1234", evidence="Aircraft Registration: N-A1234"),
                    field("part_number", raw="PN-1000-A", normalized="PN-1000-A", evidence="Part Number: PN-1000-A"),
                    field("serial_number", raw="SN-100234", normalized="SN-100234", evidence="Serial Number: SN-100234"),
                    field("component_description", raw="Hydraulic Pump Assembly", evidence="Component Description: Hydraulic Pump Assembly"),
                    field("date", qualifier="status_date", raw="2024-01-10", normalized="2024-01-10", evidence="Status Date: 2024-01-10"),
                    field("flight_hours", raw="1500", normalized="1500", evidence="Flight Hours: 1500 (since new)"),
                    field("flight_cycles", raw="980", normalized="980", evidence="Flight Cycles: 980 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours: 1500 (since new)"),
                    field("organization", raw="Meridian Technical Records Ltd.", evidence="Organization: Meridian Technical Records Ltd."),
                ],
            )
        },
    }
    expected_results["A1_status_sheet.pdf"] = {
        "sha256": h,
        "document_category": "component_status_sheet",
        "part_number": "PN-1000-A",
        "serial_number": "SN-100234",
        "scenario": "consistent_pair_member",
    }

    content = make_pdf(
        "A1_release_record.pdf",
        "Component Maintenance / Release Record",
        [
            "Part Number: PN-1000-A",
            "Serial Number: SN-100234",
            "Component Description: Hydraulic Pump Assembly",
            "Release Date: 2024-01-10",
            "Flight Hours at Release: 1500 (since new)",
            "Flight Cycles at Release: 980 (since new)",
            "Maintenance Action: Scheduled inspection completed, no defects found.",
            "Work Order Reference: WO-55521",
            "Organization: Meridian Technical Records Ltd.",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "maintenance_release_record",
        "pages": {
            "1": page_result(
                "maintenance_release_record",
                [
                    field("part_number", raw="PN-1000-A", normalized="PN-1000-A", evidence="Part Number: PN-1000-A"),
                    field("serial_number", raw="SN-100234", normalized="SN-100234", evidence="Serial Number: SN-100234"),
                    field("component_description", raw="Hydraulic Pump Assembly", evidence="Component Description: Hydraulic Pump Assembly"),
                    field("date", qualifier="release_date", raw="2024-01-10", normalized="2024-01-10", evidence="Release Date: 2024-01-10"),
                    field("flight_hours", raw="1500", normalized="1500", evidence="Flight Hours at Release: 1500 (since new)"),
                    field("flight_cycles", raw="980", normalized="980", evidence="Flight Cycles at Release: 980 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours at Release: 1500 (since new)"),
                    field("maintenance_action", raw="Scheduled inspection completed, no defects found.", evidence="Maintenance Action: Scheduled inspection completed, no defects found."),
                    field("work_order_reference", raw="WO-55521", normalized="WO-55521", evidence="Work Order Reference: WO-55521"),
                    field("organization", raw="Meridian Technical Records Ltd.", evidence="Organization: Meridian Technical Records Ltd."),
                ],
            )
        },
    }
    expected_results["A1_release_record.pdf"] = {
        "sha256": h,
        "document_category": "maintenance_release_record",
        "part_number": "PN-1000-A",
        "serial_number": "SN-100234",
        "scenario": "consistent_pair_member",
    }

    # --- Scenario B: missing required identifier -----------------------
    content = make_pdf(
        "B1_status_missing_serial.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-B5678",
            "Part Number: PN-2000-B",
            "Serial Number: [illegible / not printed]",
            "Component Description: Fuel Control Unit",
            "Status Date: 2024-02-05",
            "Flight Hours: 800 (since overhaul)",
            "Organization: Pacific Rim Aircraft Services",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": page_result(
                "component_status_sheet",
                [
                    field("aircraft_registration", raw="N-B5678", normalized="N-B5678", evidence="Aircraft Registration: N-B5678"),
                    field("part_number", raw="PN-2000-B", normalized="PN-2000-B", evidence="Part Number: PN-2000-B"),
                    # serial_number intentionally absent - unreadable, never guessed
                    field("component_description", raw="Fuel Control Unit", evidence="Component Description: Fuel Control Unit"),
                    field("date", qualifier="status_date", raw="2024-02-05", normalized="2024-02-05", evidence="Status Date: 2024-02-05"),
                    field("flight_hours", raw="800", normalized="800", evidence="Flight Hours: 800 (since overhaul)"),
                    field("usage_basis", raw="since overhaul", normalized="since_overhaul", evidence="Flight Hours: 800 (since overhaul)"),
                    field("organization", raw="Pacific Rim Aircraft Services", evidence="Organization: Pacific Rim Aircraft Services"),
                ],
            )
        },
    }
    expected_results["B1_status_missing_serial.pdf"] = {
        "sha256": h,
        "document_category": "component_status_sheet",
        "scenario": "missing_required_identifier",
        "expected_finding_rule_id": "required_identifiers_missing",
    }

    # --- Scenario C: two different components, must not be merged ------
    content = make_pdf(
        "C1_status_component_one.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-C1111",
            "Part Number: PN-3000-C",
            "Serial Number: SN-300100",
            "Component Description: Avionics Control Module",
            "Status Date: 2024-03-01",
            "Flight Hours: 300 (since new)",
            "Organization: Highland Aviation Support",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": page_result(
                "component_status_sheet",
                [
                    field("aircraft_registration", raw="N-C1111", normalized="N-C1111", evidence="Aircraft Registration: N-C1111"),
                    field("part_number", raw="PN-3000-C", normalized="PN-3000-C", evidence="Part Number: PN-3000-C"),
                    field("serial_number", raw="SN-300100", normalized="SN-300100", evidence="Serial Number: SN-300100"),
                    field("component_description", raw="Avionics Control Module", evidence="Component Description: Avionics Control Module"),
                    field("date", qualifier="status_date", raw="2024-03-01", normalized="2024-03-01", evidence="Status Date: 2024-03-01"),
                    field("flight_hours", raw="300", normalized="300", evidence="Flight Hours: 300 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours: 300 (since new)"),
                    field("organization", raw="Highland Aviation Support", evidence="Organization: Highland Aviation Support"),
                ],
            )
        },
    }
    expected_results["C1_status_component_one.pdf"] = {
        "sha256": h,
        "document_category": "component_status_sheet",
        "part_number": "PN-3000-C",
        "serial_number": "SN-300100",
        "scenario": "distinct_component_must_not_merge",
    }

    content = make_pdf(
        "C2_status_component_two.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-C1111",
            "Part Number: PN-3000-D",
            "Serial Number: SN-300101",
            "Component Description: Avionics Control Module",
            "Status Date: 2024-03-01",
            "Flight Hours: 50 (since new)",
            "Organization: Highland Aviation Support",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": page_result(
                "component_status_sheet",
                [
                    field("aircraft_registration", raw="N-C1111", normalized="N-C1111", evidence="Aircraft Registration: N-C1111"),
                    field("part_number", raw="PN-3000-D", normalized="PN-3000-D", evidence="Part Number: PN-3000-D"),
                    field("serial_number", raw="SN-300101", normalized="SN-300101", evidence="Serial Number: SN-300101"),
                    field("component_description", raw="Avionics Control Module", evidence="Component Description: Avionics Control Module"),
                    field("date", qualifier="status_date", raw="2024-03-01", normalized="2024-03-01", evidence="Status Date: 2024-03-01"),
                    field("flight_hours", raw="50", normalized="50", evidence="Flight Hours: 50 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours: 50 (since new)"),
                    field("organization", raw="Highland Aviation Support", evidence="Organization: Highland Aviation Support"),
                ],
            )
        },
    }
    expected_results["C2_status_component_two.pdf"] = {
        "sha256": h,
        "document_category": "component_status_sheet",
        "part_number": "PN-3000-D",
        "serial_number": "SN-300101",
        "scenario": "distinct_component_must_not_merge",
    }

    # --- Scenario D: genuine comparable usage discrepancy ---------------
    content = make_pdf(
        "D1_status_sheet.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-D2222",
            "Part Number: PN-4000-E",
            "Serial Number: SN-400200",
            "Component Description: Landing Gear Actuator",
            "Status Date: 2024-03-01",
            "Flight Hours: 2000 (since new)",
            "Organization: Coastal Aero Maintenance",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": page_result(
                "component_status_sheet",
                [
                    field("aircraft_registration", raw="N-D2222", normalized="N-D2222", evidence="Aircraft Registration: N-D2222"),
                    field("part_number", raw="PN-4000-E", normalized="PN-4000-E", evidence="Part Number: PN-4000-E"),
                    field("serial_number", raw="SN-400200", normalized="SN-400200", evidence="Serial Number: SN-400200"),
                    field("component_description", raw="Landing Gear Actuator", evidence="Component Description: Landing Gear Actuator"),
                    field("date", qualifier="status_date", raw="2024-03-01", normalized="2024-03-01", evidence="Status Date: 2024-03-01"),
                    field("flight_hours", raw="2000", normalized="2000", evidence="Flight Hours: 2000 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours: 2000 (since new)"),
                    field("organization", raw="Coastal Aero Maintenance", evidence="Organization: Coastal Aero Maintenance"),
                ],
            )
        },
    }
    expected_results["D1_status_sheet.pdf"] = {
        "sha256": h,
        "document_category": "component_status_sheet",
        "part_number": "PN-4000-E",
        "serial_number": "SN-400200",
        "scenario": "decreasing_usage_discrepancy_member",
    }

    content = make_pdf(
        "D1_release_record.pdf",
        "Component Maintenance / Release Record",
        [
            "Part Number: PN-4000-E",
            "Serial Number: SN-400200",
            "Component Description: Landing Gear Actuator",
            "Release Date: 2024-04-01",
            "Flight Hours at Release: 1800 (since new)",
            "Maintenance Action: Unscheduled removal and bench inspection.",
            "Work Order Reference: WO-66102",
            "Organization: Coastal Aero Maintenance",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "maintenance_release_record",
        "pages": {
            "1": page_result(
                "maintenance_release_record",
                [
                    field("part_number", raw="PN-4000-E", normalized="PN-4000-E", evidence="Part Number: PN-4000-E"),
                    field("serial_number", raw="SN-400200", normalized="SN-400200", evidence="Serial Number: SN-400200"),
                    field("component_description", raw="Landing Gear Actuator", evidence="Component Description: Landing Gear Actuator"),
                    field("date", qualifier="release_date", raw="2024-04-01", normalized="2024-04-01", evidence="Release Date: 2024-04-01"),
                    field("flight_hours", raw="1800", normalized="1800", evidence="Flight Hours at Release: 1800 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours at Release: 1800 (since new)"),
                    field("maintenance_action", raw="Unscheduled removal and bench inspection.", evidence="Maintenance Action: Unscheduled removal and bench inspection."),
                    field("work_order_reference", raw="WO-66102", normalized="WO-66102", evidence="Work Order Reference: WO-66102"),
                    field("organization", raw="Coastal Aero Maintenance", evidence="Organization: Coastal Aero Maintenance"),
                ],
            )
        },
    }
    expected_results["D1_release_record.pdf"] = {
        "sha256": h,
        "document_category": "maintenance_release_record",
        "part_number": "PN-4000-E",
        "serial_number": "SN-400200",
        "scenario": "decreasing_usage_discrepancy_member",
        "expected_finding_rule_id": "decreasing_flight_hours",
    }

    # --- Scenario E: different usage bases, must NOT false-flag ---------
    content = make_pdf(
        "E1_status_sheet.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-E3333",
            "Part Number: PN-5000-F",
            "Serial Number: SN-500300",
            "Component Description: Auxiliary Power Unit Starter",
            "Status Date: 2024-02-01",
            "Flight Hours: 500 (since overhaul)",
            "Organization: Desert Sky MRO",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": page_result(
                "component_status_sheet",
                [
                    field("aircraft_registration", raw="N-E3333", normalized="N-E3333", evidence="Aircraft Registration: N-E3333"),
                    field("part_number", raw="PN-5000-F", normalized="PN-5000-F", evidence="Part Number: PN-5000-F"),
                    field("serial_number", raw="SN-500300", normalized="SN-500300", evidence="Serial Number: SN-500300"),
                    field("component_description", raw="Auxiliary Power Unit Starter", evidence="Component Description: Auxiliary Power Unit Starter"),
                    field("date", qualifier="status_date", raw="2024-02-01", normalized="2024-02-01", evidence="Status Date: 2024-02-01"),
                    field("flight_hours", raw="500", normalized="500", evidence="Flight Hours: 500 (since overhaul)"),
                    field("usage_basis", raw="since overhaul", normalized="since_overhaul", evidence="Flight Hours: 500 (since overhaul)"),
                    field("organization", raw="Desert Sky MRO", evidence="Organization: Desert Sky MRO"),
                ],
            )
        },
    }
    expected_results["E1_status_sheet.pdf"] = {
        "sha256": h,
        "document_category": "component_status_sheet",
        "part_number": "PN-5000-F",
        "serial_number": "SN-500300",
        "scenario": "different_usage_basis_no_false_discrepancy_member",
    }

    content = make_pdf(
        "E1_release_record.pdf",
        "Component Maintenance / Release Record",
        [
            "Part Number: PN-5000-F",
            "Serial Number: SN-500300",
            "Component Description: Auxiliary Power Unit Starter",
            "Release Date: 2024-05-01",
            "Flight Hours at Release: 300 (since new)",
            "Maintenance Action: Overhauled and returned to service as new reference.",
            "Work Order Reference: WO-77230",
            "Organization: Desert Sky MRO",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "maintenance_release_record",
        "pages": {
            "1": page_result(
                "maintenance_release_record",
                [
                    field("part_number", raw="PN-5000-F", normalized="PN-5000-F", evidence="Part Number: PN-5000-F"),
                    field("serial_number", raw="SN-500300", normalized="SN-500300", evidence="Serial Number: SN-500300"),
                    field("component_description", raw="Auxiliary Power Unit Starter", evidence="Component Description: Auxiliary Power Unit Starter"),
                    field("date", qualifier="release_date", raw="2024-05-01", normalized="2024-05-01", evidence="Release Date: 2024-05-01"),
                    field("flight_hours", raw="300", normalized="300", evidence="Flight Hours at Release: 300 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours at Release: 300 (since new)"),
                    field("maintenance_action", raw="Overhauled and returned to service as new reference.", evidence="Maintenance Action: Overhauled and returned to service as new reference."),
                    field("work_order_reference", raw="WO-77230", normalized="WO-77230", evidence="Work Order Reference: WO-77230"),
                    field("organization", raw="Desert Sky MRO", evidence="Organization: Desert Sky MRO"),
                ],
            )
        },
    }
    expected_results["E1_release_record.pdf"] = {
        "sha256": h,
        "document_category": "maintenance_release_record",
        "part_number": "PN-5000-F",
        "serial_number": "SN-500300",
        "scenario": "different_usage_basis_no_false_discrepancy_member",
        "expected_no_finding_rule_id": "decreasing_flight_hours",
    }

    # --- Scenario F: an unreadable (non-required) field -----------------
    content = make_pdf(
        "F1_status_unreadable_field.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-F4444",
            "Part Number: PN-6000-G",
            "Serial Number: SN-600400",
            "Component Description: [smudged / illegible]",
            "Status Date: 2024-02-20",
            "Flight Hours: 120 (since new)",
            "Organization: Blue Harbor Aircraft Records",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": page_result(
                "component_status_sheet",
                [
                    field("aircraft_registration", raw="N-F4444", normalized="N-F4444", evidence="Aircraft Registration: N-F4444"),
                    field("part_number", raw="PN-6000-G", normalized="PN-6000-G", evidence="Part Number: PN-6000-G"),
                    field("serial_number", raw="SN-600400", normalized="SN-600400", evidence="Serial Number: SN-600400"),
                    # component_description intentionally null: smudged/illegible, never guessed
                    field("date", qualifier="status_date", raw="2024-02-20", normalized="2024-02-20", evidence="Status Date: 2024-02-20"),
                    field("flight_hours", raw="120", normalized="120", evidence="Flight Hours: 120 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours: 120 (since new)"),
                    field("organization", raw="Blue Harbor Aircraft Records", evidence="Organization: Blue Harbor Aircraft Records"),
                ],
            )
        },
    }
    expected_results["F1_status_unreadable_field.pdf"] = {
        "sha256": h,
        "document_category": "component_status_sheet",
        "part_number": "PN-6000-G",
        "serial_number": "SN-600400",
        "scenario": "unreadable_non_required_field",
    }

    # --- Scenario G: expected document (release record) missing ---------
    content = make_pdf(
        "G1_status_no_release.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-G5555",
            "Part Number: PN-7000-H",
            "Serial Number: SN-700500",
            "Component Description: Oxygen Generator",
            "Status Date: 2024-01-15",
            "Flight Hours: 60 (since new)",
            "Organization: Summit Aviation Records",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": page_result(
                "component_status_sheet",
                [
                    field("aircraft_registration", raw="N-G5555", normalized="N-G5555", evidence="Aircraft Registration: N-G5555"),
                    field("part_number", raw="PN-7000-H", normalized="PN-7000-H", evidence="Part Number: PN-7000-H"),
                    field("serial_number", raw="SN-700500", normalized="SN-700500", evidence="Serial Number: SN-700500"),
                    field("component_description", raw="Oxygen Generator", evidence="Component Description: Oxygen Generator"),
                    field("date", qualifier="status_date", raw="2024-01-15", normalized="2024-01-15", evidence="Status Date: 2024-01-15"),
                    field("flight_hours", raw="60", normalized="60", evidence="Flight Hours: 60 (since new)"),
                    field("usage_basis", raw="since new", normalized="since_new", evidence="Flight Hours: 60 (since new)"),
                    field("organization", raw="Summit Aviation Records", evidence="Organization: Summit Aviation Records"),
                ],
            )
        },
    }
    expected_results["G1_status_no_release.pdf"] = {
        "sha256": h,
        "document_category": "component_status_sheet",
        "part_number": "PN-7000-H",
        "serial_number": "SN-700500",
        "scenario": "expected_document_missing_member",
        "expected_finding_rule_id": "expected_document_missing",
        "requires_project_setting": "require_maintenance_release_for_status_sheets",
    }

    # --- Scenario H: a processing failure, must not look like success ---
    content = make_pdf(
        "H1_processing_failure.pdf",
        "Component Status Sheet",
        [
            "Aircraft Registration: N-H6666",
            "Part Number: PN-8000-I",
            "Serial Number: SN-800600",
            "Component Description: Simulated corrupted scan page.",
        ],
    )
    h = sha256_of(content)
    demo_fixtures[h] = {
        "document_category": "component_status_sheet",
        "pages": {
            "1": {
                "simulate_error": True,
                "simulate_error_message": "Simulated OCR engine timeout while reading page 1 (demo fixture).",
            }
        },
    }
    expected_results["H1_processing_failure.pdf"] = {
        "sha256": h,
        "scenario": "processing_failure_must_not_look_clean",
    }

    (HERE / "demo_fixtures.json").write_text(json.dumps(demo_fixtures, indent=2), encoding="utf-8")
    (HERE / "expected_results.json").write_text(json.dumps(expected_results, indent=2), encoding="utf-8")
    print(f"Generated {len(demo_fixtures)} PDFs into {PDFS_DIR}")
    print("Wrote demo_fixtures.json and expected_results.json")


if __name__ == "__main__":
    main()
