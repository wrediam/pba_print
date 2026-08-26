Church Copier Setup - Windows
=============================

WHAT THIS DOES
  Sets up the church copier on this PC. It creates one printer per
  department you print for, each pointed at the church print gateway.
  The gateway adds your account code and handles the copier's options,
  so nothing sensitive is stored on this PC.

HOW TO USE
  1. Keep both files together in the same folder:
       - Install Church Printer.bat
       - Install-ChurchPrinter.ps1
  2. Make sure you're on the church network.
  3. Double-click "Install Church Printer.bat".
  4. Click "Yes" when Windows asks for administrator permission
     (adding printers needs it).
  5. Enter your personal printer code (just your number, e.g. 598).
     It will check the code and show your name to confirm.
  6. Pick the department(s) you print for and click OK.

REQUIREMENTS
  - Windows 10 (version 1809 or newer) or Windows 11 -- these include
    the built-in "Microsoft IPP Class Driver" this uses.
  - Administrator rights on the PC (the launcher asks for them).

PRINTING IN COLOR
  Color prints only when you choose it in the print dialog. If color
  seems unavailable or a color job errors, the copier may not have
  color turned on for that department yet -- tell the church office.

IF THE FINISHING OPTIONS (staple / hole punch / trays) DON'T SHOW UP
  This uses Windows' driverless IPP printing. On most setups the
  finishing options come through automatically. If they don't for your
  PC, the church office can install the Sharp BP-71C65 Windows
  PostScript driver and re-point the printer at the same gateway
  address -- see docs/GATEWAY_MIGRATION.md.

NOTE
  This installer talks to the dashboard at 192.168.8.235:3000 by
  default. If that address changes, edit the $DashboardHost line at the
  top of Install-ChurchPrinter.ps1.
