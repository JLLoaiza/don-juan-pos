-- Repair historical idempotency results produced by DATE values mapped with String(Date).
-- The canonical date is still held by the immutable/current workforce record.

UPDATE command_operations command
SET result = jsonb_set(command.result, '{effectiveFrom}', to_jsonb(to_char(rate.effective_from, 'YYYY-MM-DD')))
FROM employee_wage_rates rate
WHERE command.command_name = 'employee_wage_rates.create'
  AND command.result ? 'id'
  AND command.result ->> 'id' ~ '^[0-9a-fA-F-]{36}$'
  AND rate.id = (command.result ->> 'id')::uuid;

UPDATE command_operations command
SET result = jsonb_set(command.result, '{workDate}', to_jsonb(to_char(shift.work_date, 'YYYY-MM-DD')))
FROM employee_shifts shift
WHERE command.command_name IN ('employee_shifts.clock_in', 'employee_shifts.clock_out')
  AND command.result ? 'id'
  AND command.result ->> 'id' ~ '^[0-9a-fA-F-]{36}$'
  AND shift.id = (command.result ->> 'id')::uuid;

UPDATE command_operations command
SET result = jsonb_set(command.result, '{bonusDate}', to_jsonb(to_char(bonus.bonus_date, 'YYYY-MM-DD')))
FROM employee_bonuses bonus
WHERE command.command_name = 'employees.create_bonus'
  AND command.result ? 'id'
  AND command.result ->> 'id' ~ '^[0-9a-fA-F-]{36}$'
  AND bonus.id = (command.result ->> 'id')::uuid;

UPDATE command_operations command
SET result = jsonb_set(command.result, '{paymentDate}', to_jsonb(to_char(payment.payment_date, 'YYYY-MM-DD')))
FROM employee_payments payment
WHERE command.command_name IN ('employee_payments.create', 'employee_payments.void')
  AND command.result ? 'id'
  AND command.result ->> 'id' ~ '^[0-9a-fA-F-]{36}$'
  AND payment.id = (command.result ->> 'id')::uuid;