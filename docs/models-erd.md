# FruitPAK — Entity Relationship Diagram

## Fruit Flow (harvest → export)

```
                          ┌──────────────────────┐
                          │       Grower          │
                          │ name, grower_code,    │
                          │ fields[], certif.     │
                          └──────────┬───────────┘
                                     │ 1
                                     │
                          ┌──────────▼───────────┐
                          │    HarvestTeam        │
                          │ name, leader, size    │◄──── Supplier (labour)
                          │ fruit_types[]         │
                          └──────────┬───────────┘
                                     │ 0..1
                                     │
  ┌───────────┐           ┌──────────▼───────────┐
  │ Packhouse │ 1 ◄───────│       Batch           │
  │ name,     │           │ batch_code (GRN)      │
  │ location, │           │ gross/tare/net_kg     │
  │ cold_rooms│           │ quality_assessment{}  │
  └─────┬─────┘           │ status: received →    │
        │                 │   grading → packing → │
        │                 │   complete            │
        │                 └──────────┬───────────┘
        │                            │ 1
        │                   ┌────────┴────────┐
        │                   │    1..*          │
        │        ┌──────────▼───────────┐     │
        │        │        Lot           │     │
        │ 1 ◄────│ lot_code, grade,     │     │
        │        │ size, fruit_type,    │     │
        │        │ pack_spec, cartons   │     │
        │        │ quality_data{}       │     │
        │        └──────────┬───────────┘     │
        │                   │ 1               │
        │                   │                 │
        │        ┌──────────▼───────────┐     │
        │ 1 ◄────│       Pallet         │     │
        │        │ pallet_code, grade,  │     │    ┌──────────────┐
        │        │ cartons, layers,     │     │    │  PackSpec     │
        │        │ cold_store_room,     │◄────┘    │ name, type,  │
        │        │ net/gross_weight_kg  │          │ weight_kg,   │
        │        └──────────┬───────────┘          │ cartons/layer│
        │                   │ 0..1                 │ layers/pallet│
        │                   │                      └──────────────┘
        │        ┌──────────▼───────────┐
        │ 0..1◄──│     Container        │
        │        │ container_number,    │     ┌────────────────┐
        │        │ seal_number,         │◄────│TransportConfig │
        │        │ pallet_count,        │     │ temp, capacity │
        │        │ temp_readings[]      │     └────────────────┘
        │        └──────────┬───────────┘
        │                   │ 0..1
        │                   │
        │        ┌──────────▼───────────┐
        │        │       Export         │
        │        │ booking_ref,         │
        │        │ client, destination, │
        │        │ vessel, ETD/ETA,     │
        │        │ PPECB, phyto certs   │
        │        └──────────────────────┘
        │
  ──────┘

                    ┌──────────────────────────────────────────┐
                    │            BatchHistory                   │
                    │ (immutable event log — TimescaleDB)       │
                    │ batch_id → Batch                         │
                    │ event_type: intake|grading|packing|       │
                    │   cold_storage|loading|export|rejected    │
                    │ event_data{}, recorded_at (hypertable PK)│
                    └──────────────────────────────────────────┘
```

## Financial Models

```
  ┌──────────────────┐          ┌──────────────────┐
  │  GrowerPayment   │          │  ClientInvoice   │
  │ payment_ref      │          │ invoice_number   │
  │ grower_id →      │          │ client_name      │
  │ batch_ids[]      │          │ export_id →      │
  │ gross/deductions │          │ line_items[]     │
  │ net_amount       │          │ subtotal/tax/    │
  │ rate_per_kg      │          │ total/balance    │
  │ status: pending →│          │ status: draft →  │
  │  approved → paid │          │  issued → paid   │
  └───────┬──────────┘          └───────┬──────────┘
          │                             │
          │ 0..*                        │ 0..*
          ▼                             ▼
  ┌──────────────────────────────────────────────┐
  │                  Credit                       │
  │ credit_number                                 │
  │ credit_type: client_credit | grower_credit    │
  │ reason: quality_claim | short_delivery | ...  │
  │ invoice_id → | grower_payment_id →            │
  │ line_items[], total_amount                    │
  │ status: draft → issued → applied              │
  └───────────────────────────────────────────────┘

  ┌──────────────────┐
  │   LabourCost     │
  │ category:        │
  │  packing|harvest │
  │  |cold_store|... │
  │ supplier_id →    │
  │ packhouse_id →   │
  │ hours, rate,     │
  │ headcount, total │
  │ extras{}         │
  └──────────────────┘
```

## FK Summary Table

| Child Table      | FK Column            | → Parent Table     | Cardinality |
|------------------|----------------------|--------------------|-------------|
| Batch            | grower_id            | Grower             | N:1         |
| Batch            | harvest_team_id      | HarvestTeam        | N:1         |
| Batch            | packhouse_id         | Packhouse          | N:1         |
| BatchHistory     | batch_id             | Batch              | N:1         |
| BatchHistory     | packhouse_id         | Packhouse          | N:1         |
| BatchHistory     | pack_line_id         | PackLine           | N:1         |
| Lot              | batch_id             | Batch              | N:1         |
| Lot              | grower_id            | Grower             | N:1         |
| Lot              | packhouse_id         | Packhouse          | N:1         |
| Lot              | pack_line_id         | PackLine           | N:1         |
| Lot              | product_config_id    | ProductConfig      | N:1         |
| Lot              | pack_spec_id         | PackSpec           | N:1         |
| Pallet           | lot_id               | Lot                | N:1         |
| Pallet           | packhouse_id         | Packhouse          | N:1         |
| Pallet           | pack_spec_id         | PackSpec           | N:1         |
| Pallet           | container_id         | Container          | N:1         |
| Container        | transport_config_id  | TransportConfig    | N:1         |
| Container        | packhouse_id         | Packhouse          | N:1         |
| Container        | export_id            | Export             | N:1         |
| GrowerPayment    | grower_id            | Grower             | N:1         |
| ClientInvoice    | export_id            | Export             | N:1         |
| Credit           | invoice_id           | ClientInvoice      | N:1         |
| Credit           | grower_payment_id    | GrowerPayment      | N:1         |
| Credit           | export_id            | Export             | N:1         |
| LabourCost       | supplier_id          | Supplier           | N:1         |
| LabourCost       | packhouse_id         | Packhouse          | N:1         |
| LabourCost       | pack_line_id         | PackLine           | N:1         |
| LabourCost       | harvest_team_id      | HarvestTeam        | N:1         |

## PlantUML (paste into plantuml.com)

```plantuml
@startuml FruitPAK_ERD
skinparam linetype ortho

entity Grower {
  *id : UUID <<PK>>
  name, grower_code
  fields[] : JSON
  globalg_ap_certified
}

entity HarvestTeam {
  *id : UUID <<PK>>
  name, team_leader
  --
  grower_id <<FK>>
  supplier_id <<FK>>
}

entity Packhouse {
  *id : UUID <<PK>>
  name, location
  capacity_tons_per_day
  cold_rooms
}

entity Batch {
  *id : UUID <<PK>>
  batch_code <<UNIQUE>>
  --
  grower_id <<FK>>
  harvest_team_id <<FK>>
  packhouse_id <<FK>>
  --
  fruit_type, variety
  gross/tare/net_weight_kg
  quality_assessment : JSON
  status
}

entity BatchHistory {
  *id : UUID <<PK>>
  batch_id <<FK>>
  event_type, event_subtype
  event_data : JSON
  recorded_at <<HYPERTABLE>>
}

entity Lot {
  *id : UUID <<PK>>
  lot_code <<UNIQUE>>
  --
  batch_id <<FK>>
  grower_id <<FK>>
  packhouse_id <<FK>>
  pack_line_id <<FK>>
  product_config_id <<FK>>
  pack_spec_id <<FK>>
  --
  fruit_type, grade, size
  carton_count, weight_kg
  quality_data : JSON
  status
}

entity Pallet {
  *id : UUID <<PK>>
  pallet_code <<UNIQUE>>
  --
  lot_id <<FK>>
  packhouse_id <<FK>>
  pack_spec_id <<FK>>
  container_id <<FK>>
  --
  fruit_type, grade, size
  carton_count, layers
  cold_store_room
  status
}

entity Container {
  *id : UUID <<PK>>
  container_number <<UNIQUE>>
  --
  transport_config_id <<FK>>
  packhouse_id <<FK>>
  export_id <<FK>>
  --
  pallet_count, total_cartons
  seal_number
  temp_readings : JSON
  status
}

entity Export {
  *id : UUID <<PK>>
  booking_ref <<UNIQUE>>
  --
  client_name, destination
  vessel_name, voyage
  etd, eta
  ppecb_cert, phyto_cert
  status
}

entity GrowerPayment {
  *id : UUID <<PK>>
  payment_ref <<UNIQUE>>
  grower_id <<FK>>
  batch_ids : JSON
  gross/deductions/net
  status
}

entity ClientInvoice {
  *id : UUID <<PK>>
  invoice_number <<UNIQUE>>
  export_id <<FK>>
  line_items : JSON
  subtotal, tax, total
  status
}

entity Credit {
  *id : UUID <<PK>>
  credit_number <<UNIQUE>>
  invoice_id <<FK>>
  grower_payment_id <<FK>>
  credit_type, reason
  total_amount
  status
}

entity LabourCost {
  *id : UUID <<PK>>
  category, description
  supplier_id <<FK>>
  packhouse_id <<FK>>
  hours, rate, total
}

Grower ||--o{ Batch
HarvestTeam |o--o{ Batch
Packhouse ||--o{ Batch
Batch ||--o{ BatchHistory
Batch ||--o{ Lot
Lot ||--o{ Pallet
Pallet }o--o| Container
Container }o--o| Export
Grower ||--o{ GrowerPayment
Export ||--o{ ClientInvoice
ClientInvoice ||--o{ Credit
GrowerPayment ||--o{ Credit
@enduml
```
