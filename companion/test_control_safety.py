"""Safety regression tests: mocked native APIs/configuration, no OS actions or credentials."""
import ctypes
from contextlib import ExitStack
import json
import unittest
from unittest.mock import Mock, mock_open, patch

import control


class ElevationTests(unittest.TestCase):
    def native(self, elevated=0, opened=True, queried=True, valid_size=True):
        adv, kernel = Mock(), Mock()
        adv.OpenProcessToken.return_value = opened
        def query(token, kind, output, length, returned):
            self.assertEqual(kind, 20)
            output._obj.value = elevated
            returned._obj.value = length if valid_size else 0
            return queried
        adv.GetTokenInformation.side_effect = query
        return adv, kernel

    def check_native(self, elevated):
        adv, kernel = self.native(elevated)
        with patch.object(control.ctypes, 'WinDLL', side_effect=[adv, kernel], create=True):
            self.assertEqual(control.process_is_elevated(), bool(elevated))
        kernel.CloseHandle.assert_called_once()
        self.assertEqual(adv.OpenProcessToken.call_args.args[1], 0x8)

    def test_standard_token(self):
        self.check_native(0)

    def test_elevated_token(self):
        self.check_native(1)

    def test_open_failure(self):
        adv, kernel = self.native(opened=False)
        with patch.object(control.ctypes, 'WinDLL', side_effect=[adv, kernel], create=True):
            with self.assertRaises(OSError):
                control.process_is_elevated()
        kernel.CloseHandle.assert_not_called()

    def test_query_failure_closes_handle(self):
        adv, kernel = self.native(queried=False)
        with patch.object(control.ctypes, 'WinDLL', side_effect=[adv, kernel], create=True):
            with self.assertRaises(OSError):
                control.process_is_elevated()
        kernel.CloseHandle.assert_called_once()

    def test_invalid_result_size_closes_handle(self):
        adv, kernel = self.native(valid_size=False)
        with patch.object(control.ctypes, 'WinDLL', side_effect=[adv, kernel], create=True):
            with self.assertRaises(OSError):
                control.process_is_elevated()
        kernel.CloseHandle.assert_called_once()


class ControllerLoadingTests(unittest.TestCase):
    def load(self, elevated=False, enabled=True, error=None):
        config = json.dumps({'enabled': enabled, 'apps': []})
        with patch.object(control.os, 'name', 'nt'), patch.object(control.os.path, 'getsize', return_value=len(config)), patch('builtins.open', mock_open(read_data=config)), patch.object(control, 'process_is_elevated', return_value=elevated, side_effect=error) as probe, patch.object(control, 'Controller') as factory:
            result = control.load_controller('mock-config', 'synthetic-control', 'synthetic-read')
            return result, probe, factory

    def test_elevated_remains_monitoring_only(self):
        result, probe, factory = self.load(elevated=True)
        self.assertIsNone(result)
        factory.assert_not_called()

    def test_unknown_privilege_remains_monitoring_only(self):
        result, probe, factory = self.load(error=OSError('mock query failure'))
        self.assertIsNone(result)
        factory.assert_not_called()

    def test_standard_user_can_load_controls(self):
        result, probe, factory = self.load()
        self.assertIs(result, factory.return_value)
        factory.assert_called_once_with('synthetic-control', 'synthetic-read', [])

    def test_disabled_controls_skip_native_probe(self):
        result, probe, factory = self.load(enabled=False)
        self.assertIsNone(result)
        probe.assert_not_called()
        factory.assert_not_called()

    def test_absent_config_does_not_read_or_probe(self):
        with patch('builtins.open') as read, patch.object(control, 'process_is_elevated') as probe:
            self.assertIsNone(control.load_controller(None, '', ''))
        read.assert_not_called()
        probe.assert_not_called()


class NativeActionTests(unittest.TestCase):
    def lock(self, succeeds):
        api = Mock()
        api.LockWorkStation.return_value = succeeds
        with ExitStack() as stack:
            dll = stack.enter_context(patch.object(control.ctypes, 'WinDLL', return_value=api, create=True))
            stack.enter_context(patch.object(control.os, 'name', 'nt'))
            stack.enter_context(patch.object(control.ctypes, 'get_last_error', return_value=5, create=True))
            stack.enter_context(patch.object(control.ctypes, 'WinError', side_effect=lambda code: OSError(code, 'mock native failure'), create=True))
            if succeeds:
                control.WindowsActions({}).execute('lock', '')
            else:
                with self.assertRaises(OSError):
                    control.WindowsActions({}).execute('lock', '')
        dll.assert_called_once_with('user32', use_last_error=True)
        api.LockWorkStation.assert_called_once_with()

    def test_lock_success(self):
        self.lock(True)

    def test_lock_failure(self):
        self.lock(False)

    def sleep_case(self, failure=None):
        adv, kernel, power = Mock(), Mock(), Mock()
        events = []
        last_error = [0]
        def opened(process, access, output):
            self.assertEqual(access, 0x28)
            output._obj.value = 123
            return failure != 'open'
        adv.OpenProcessToken.side_effect = opened
        adv.LookupPrivilegeValueW.return_value = failure != 'lookup'
        def adjust(token, disable, privileges, length, previous, size):
            self.assertEqual(token.value, 123)
            self.assertFalse(disable)
            if previous is not None:
                events.append('enable')
                self.assertEqual(privileges._obj.Count, 1)
                self.assertEqual(privileges._obj.Attributes, 2)
                # Distinct previous state proves restoration uses the returned value.
                previous._obj.Count = 1
                previous._obj.Luid.LowPart = 77
                previous._obj.Attributes = 0
                if failure == 'not_assigned':
                    last_error[0] = 1300
                return failure != 'adjust'
            events.append('restore')
            self.assertEqual(privileges._obj.Count, 1)
            self.assertEqual(privileges._obj.Luid.LowPart, 77)
            self.assertEqual(privileges._obj.Attributes, 0)
            self.assertEqual(length, 0)
            self.assertIsNone(size)
            return True
        adv.AdjustTokenPrivileges.side_effect = adjust
        def suspend(*args):
            events.append('suspend')
            self.assertEqual(args, (False, False, False))
            return failure != 'suspend'
        power.SetSuspendState.side_effect = suspend
        def close(token):
            self.assertEqual(token.value, 123)
            events.append('close')
            return True
        kernel.CloseHandle.side_effect = close
        with ExitStack() as stack:
            stack.enter_context(patch.object(control.ctypes, 'WinDLL', side_effect=[adv, kernel, power], create=True))
            stack.enter_context(patch.object(control.os, 'name', 'nt'))
            stack.enter_context(patch.object(control.ctypes, 'get_last_error', side_effect=lambda: last_error[0], create=True))
            stack.enter_context(patch.object(control.ctypes, 'set_last_error', side_effect=lambda value: last_error.__setitem__(0, value), create=True))
            stack.enter_context(patch.object(control.ctypes, 'WinError', side_effect=lambda code: OSError(code, 'mock native failure'), create=True))
            if failure:
                with self.assertRaises(OSError):
                    control.WindowsActions({}).execute('sleep', '')
            else:
                control.WindowsActions({}).execute('sleep', '')
        if failure == 'open':
            self.assertEqual(events, [])
            adv.LookupPrivilegeValueW.assert_not_called()
        else:
            adv.LookupPrivilegeValueW.assert_called_once()
            self.assertEqual(adv.LookupPrivilegeValueW.call_args.args[:2], (None, 'SeShutdownPrivilege'))
            kernel.CloseHandle.assert_called_once()
            if failure == 'lookup':
                self.assertEqual(events, ['close'])
            elif failure in ('adjust', 'not_assigned'):
                self.assertEqual(events, ['enable', 'close'])
            else:
                self.assertEqual(events, ['enable', 'suspend', 'restore', 'close'])
        if failure in ('open', 'lookup', 'adjust', 'not_assigned'):
            power.SetSuspendState.assert_not_called()

    def test_sleep_success_restores_privilege_and_closes_handle(self):
        self.sleep_case()

    def test_sleep_failure_restores_privilege_and_closes_handle(self):
        self.sleep_case('suspend')

    def test_sleep_open_failure_does_not_close_invalid_handle(self):
        self.sleep_case('open')

    def test_sleep_lookup_failure_closes_handle_without_suspending(self):
        self.sleep_case('lookup')

    def test_sleep_adjust_failure_closes_handle_without_suspending(self):
        self.sleep_case('adjust')

    def test_sleep_unassigned_privilege_fails_closed(self):
        self.sleep_case('not_assigned')


if __name__ == '__main__':
    unittest.main()
