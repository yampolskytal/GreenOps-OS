"""Create deterministic representative inputs. All numbers are fictional."""
import csv
import json
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

from engine.greenops import BONUS, END, START


def generate(path):
    path = Path(path)
    if path.exists() and any(path.iterdir()):
        raise ValueError("Demo destination must be empty")
    data = defaultdict(list)

    def add(name, **row):
        data[name].append(row)

    for rid, tool, dept, center, env, criticality in (
        ("dp-dev", "Development platform", "IT", 4500, "dev", "low"),
        ("dp-prod", "Production platform", "Consulting", 4000, "prod", "high"),
        ("gpu-lab", "GPU lab", "IT", 4500, "dev", "low"),
        ("vm-stage", "Staging VM", "IT", 4500, "test", "low"),
        ("vm-live", "Customer portal", "Sales", 4100, "prod", "high"),
        ("host-logs", "Managed logs", "IT", 4500, "prod", "high"),
    ):
        add("mapping_departments_tools", resource_id=rid, tool=tool, department=dept, cost_center=center,
            environment=env, criticality=criticality, responsible_role="Platform service owner",
            default_project="P-001", rechargeable="no")

    for rid, region, kind, cpu, ram, env, criticality in (
        ("gpu-lab", "Frankfurt", "ml", 8, 24, "dev", "low"),
        ("vm-stage", "Dublin", "test", 8, 18, "test", "low"),
        ("vm-live", "Zurich", "prod", 16, 65, "prod", "high"),
    ):
        add("server_inventory", server_id=rid, region=region, type=kind, vcpu=cpu, ram_gb=64,
            environment=env, criticality=criticality, owner_cost_center=4500,
            ram_utilisation_30d_pct=ram, runtime_h_30d=720, last_login="2026-08-30")

    add("it_tickets", ticket_id="DEMO-1", date="2026-08-14", resource_id="dp-prod", type="Change",
        title="Production availability", description="Nightly ETL 01:00–04:30, Saturday reconciliation 06:00–08:00. Preserve emergency recovery access.", status="approved")
    add("it_tickets", ticket_id="DEMO-2", date="2026-08-18", resource_id="gpu-lab", type="Note",
        title="GPU readiness", description="Model validation workload can begin on short notice. Owner to approve pre-warm and request queue.", status="closed")

    for i in range((END - START).days):
        d = START + timedelta(days=i)
        work = int(d.weekday() < 5 and d.strftime("%m-%d") not in ("12-25", "01-01", "08-01"))
        add("business_calendar", date=d, weekday=d.strftime("%A"), workday=work,
            public_holiday="Representative holiday" if d.weekday() < 5 and not work else "")
        azure_rows = [
            ("dp-dev", "Frankfurt", 96, "node-hour", 210 + i % 17, "EUR", "dev"),
            ("dp-prod", "Zurich", 48, "node-hour", 75 + i % 9, "CHF", "prod"),
            ("gpu-lab", "Frankfurt", 24, "GPU-hour", 29, "CHF", "dev"),
        ]
        for rid, region, qty, unit, cost, currency, env in azure_rows:
            add("azure_costs", Date=d, ResourceId="/subscriptions/demo/resources/" + rid,
                ServiceName="GPU instances" if unit == "GPU-hour" else "Data platform",
                ResourceLocation=region, Quantity=qty, UnitOfMeasure=unit, CostInBillingCurrency=cost,
                BillingCurrency=currency, Tags=json.dumps({"environment": env}), ChargeType="Usage")
        if i == 2:
            data["azure_costs"].append(dict(data["azure_costs"][-1]))
            add("azure_costs", **{**data["azure_costs"][-1], "Quantity": 0, "CostInBillingCurrency": -15, "ChargeType": "Credit"})
        for rid, region, cpu, value in (("vm-stage", "eu-west-1", 8, 9), ("vm-live", "eu-central-2", 16, 22)):
            add("aws_costs", line_item_usage_start_date=f"{d}T00:00:00",
                line_item_resource_id=f"arn:aws:ec2:demo:instance/{rid}", product_region=region,
                line_item_usage_amount=cpu * 24, pricing_unit="vCPU-hour",
                line_item_unblended_cost="" if i == 3 and rid == "vm-stage" else value,
                line_item_currency_code="USD", line_item_line_item_type="Usage", product_servicecode="Compute instances")
        add("hoster_invoice", Date=d.strftime("%d.%m.%Y"), Item="Managed logs", Service="Log storage",
            Quantity=1300, Unit="GB-day", Amount_CHF=6, CostCenter=4500, ProjectNumber="project 01")
        for rid, nodes, region, active in (("dp-dev", 4, "Frankfurt", 3 if work else 1),
                                            ("dp-prod", 2, "Zurich", 18 if work else 5)):
            add("data_platform_usage", date=d, resource_id=rid, cluster=rid, region=region, node_count=nodes,
                runtime_h=24, active_use_h=active, query_count=active * 30)
        add("ai_usage", date=d, resource_id="ai-assistant", tool="Research assistant", department="Consulting",
            task_type="Summarise", model_class="large", provider="OpenAI", model="Demo text model",
            requests=1600, tokens_in=1300000, tokens_in_cache=250000, tokens_out="" if i == 7 else 420000,
            cost_chf=14, project_id="P_01")

        if d.weekday() == 0:
            for rid, cpu, peak, ram, gpu in (("gpu-lab", 8, 25, 24, 9), ("vm-stage", 10, 23, 18, ""), ("vm-live", 48, 89, 65, "")):
                add("server_metrics_weekly", week_start=d, server_id=rid, cpu_avg_pct=cpu + i % 4,
                    cpu_max_pct=peak, ram_avg_pct=ram, uptime_h=168, gpu_avg_pct=gpu)
            add("m365_usage", week_start=d, department="People", cost_center=4400, active_users=12,
                storage=18000 if i % 2 else 18, storage_unit="MB" if i % 2 else "GB", teams_video_minutes=2400, mails_sent=310)
            add("data_platform_jobs", date=d, job_name="Development refresh", resource_id="dp-dev", start_time="08:00",
                duration_h=1.25, status="ok", triggered_by="schedule", time_window="flexible: 08:00–15:00")
            add("data_platform_jobs", date=d, job_name="Nightly ETL", resource_id="dp-prod", start_time="01:00",
                duration_h=3.5, status="ok", triggered_by="schedule", time_window="fixed: finished by 04:30")
            add("ci_pipeline_runs", pipeline="nightly-full", repo="portal", trigger="schedule", started_at=f"{d}T02:00:00",
                runner="aws-eu-west-1", commits_since_last_nightly=i % 3, metrics={"duration_sec": 650, "cpu_h": .72}, status="ok")
            add("ai_agent_runs", run_id=f"demo-{i}", agent="report-agent", start=f"{d}T08:30:00", retries=i % 3,
                duration_seconds=23, usage={"tokens_in": 1800, "tokens_out": 500}, report_opened=i % 2)
            add("web_traffic", time_utc=f"{d}T09:00:00Z", requests=1000, sample_rate=10, bot_share_pct=30, gb_out=2)
            add("log_volume", date=d, service="portal", log_gb=1750, unit="MB", retention_days=90)
            add("powerbi_usage", date=d, resource_id="pbi-01", report="Archive sales view", refresh_count=4,
                refresh_duration_min=12, view_count=0, report_type="operational")
        if d.day == 1:
            add("exchange_rates", month=d, eur_chf=.94 + .002 * (i % 3), usd_chf=.86 + .004 * (i % 3))
            for product, provider, seats, active, price in (("ChatGPT Team", "OpenAI", 70, 28, 25), ("Claude Team", "Anthropic", 34, 22, 25)):
                add("ai_subscriptions", month=d, product=product, provider=provider, cost_center=4500,
                    licences_purchased=seats, licences_active_30d=active, messages_30d=3000,
                    price_per_seat=price, currency="USD", amount=seats * price,
                    contract_status="Final", contract_end="2026-12-31", notice_period_days=30, billing="monthly")
            if d.month == 8:
                data["ai_subscriptions"].append({**data["ai_subscriptions"][-1], "contract_status": "Draft", "amount": 500})
            add("saas_contracts", month=d, contract="Design workspace", provider="Demo supplier", cost_center=4300,
                licences_purchased=40, licences_active_30d=14, price_per_licence=42, currency="CHF", amount=1680,
                contract_status="Final", contract_end="2026-12-31", notice_period_days=60, billing="annual")
            add("ai_invoice_monthly", month=d, provider="OpenAI", model_class="large", tokens_in=40500000,
                tokens_out=12500000, currency="USD", amount=540)
            add("provider_monthly_report", month=d, total_cost_chf=10800, label="Cloud total, provider export")
            add("headcount", month=d, department="IT", fte=16)
            add("project_hours_monthly", month=d, project_id="project 001", department="IT", hours=225)

    add("projects", project_id="P-001", project_name="Demo platform renewal", status="ongoing", rechargeable="no")
    add("data_center_locations", provider="OpenAI", region="EU mix", location="Europe mixed", used_by_sme="yes")
    add("data_catalog_tables", table="historic_orders", schema="raw", size_gb=300, last_read="2025-12-01",
        retention_required="yes", data_class="personal data")
    for tool in ("Backup A", "Backup B"):
        add("backup_chains", source="Production platform", backup_tool=tool, size_gb=300,
            retention_days=90, category="DB", second_site="yes", criticality="high", data_class="confidential")
    for name, rows in data.items():
        target = path / ("extra" if name in BONUS else "")
        target.mkdir(parents=True, exist_ok=True)
        if name in ("ci_pipeline_runs", "ai_agent_runs"):
            (target / (name + ".jsonl")).write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
        else:
            with (target / (name + ".csv")).open("w", newline="", encoding="utf-8-sig") as out:
                fields = list(dict.fromkeys(k for r in rows for k in r))
                writer = csv.DictWriter(out, fields)
                writer.writeheader()
                writer.writerows(rows)
    (path / "DEMO_ONLY.txt").write_text("Fictional GreenOps demonstration, including FX, usage, invoices and hourly grid factors.\n", encoding="utf-8")
