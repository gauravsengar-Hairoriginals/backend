-- Truncate orders, order_line_items, and discount_codes tables
-- Uses CASCADE to handle foreign key constraints
TRUNCATE TABLE order_line_items, orders, discount_codes CASCADE;

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNWY5ZGI4MS1kZGE4LTQwMzQtODBiZC00NzI3OWIwOTNiOGQiLCJlbWFpbCI6ImFkbWluQGhhaXJvcmlnaW5hbHMuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIiwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3NzA4MTAzMTgsImV4cCI6MTc3MDgxMTIxOH0.Wx2E7GXjxTL3iOIaWQJ9je9GRT5AlxFcVAPDNBJ5gXQ

curl -X POST http://localhost:3000/api/v1/orders/sync/range \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNWY5ZGI4MS1kZGE4LTQwMzQtODBiZC00NzI3OWIwOTNiOGQiLCJlbWFpbCI6ImFkbWluQGhhaXJvcmlnaW5hbHMuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIiwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3NzA4MTI4NDQsImV4cCI6MTc3MDgxMzc0NH0.SLALHlwz--Nx5aXy_1y_qepKj67pdopP4Uox0XjTt4I" \
  -d '{                              
    "startDate": "2026-02-01T00:00:00Z",
    "endDate": "2026-02-03T23:59:59Z"
  }'