import { Outlet } from "@remix-run/react";

// Parent layout for /app/locations/*
export default function LocationsLayout() {
  return <Outlet />;
}
