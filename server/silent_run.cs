using System;
using System.Diagnostics;
using System.IO;
using System.Text;

class Program {
    static string EscapeArg(string arg) {
        if (string.IsNullOrEmpty(arg)) return "\"\"";
        if (arg.IndexOfAny(new char[] { ' ', '\t', '\n', '\r', '\"' }) == -1) {
            return arg;
        }
        var sb = new StringBuilder();
        sb.Append('\"');
        for (int i = 0; i < arg.Length; i++) {
            char c = arg[i];
            if (c == '\\') {
                int numBackslash = 1;
                while (i + 1 < arg.Length && arg[i + 1] == '\\') {
                    numBackslash++;
                    i++;
                }
                if (i + 1 < arg.Length && arg[i + 1] == '\"') {
                    sb.Append('\\', numBackslash * 2);
                } else if (i == arg.Length - 1) {
                    sb.Append('\\', numBackslash * 2);
                } else {
                    sb.Append('\\', numBackslash);
                }
            } else if (c == '\"') {
                sb.Append("\\\"");
            } else {
                sb.Append(c);
            }
        }
        sb.Append('\"');
        return sb.ToString();
    }

    static int Main(string[] args) {
        if (args.Length == 0) return 0;
        try {
            string exe = args[0];
            var sbArgs = new StringBuilder();
            for (int i = 1; i < args.Length; i++) {
                if (i > 1) sbArgs.Append(' ');
                sbArgs.Append(EscapeArg(args[i]));
            }

            var psi = new ProcessStartInfo {
                FileName = exe,
                Arguments = sbArgs.ToString(),
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            var p = Process.Start(psi);
            string outText = p.StandardOutput.ReadToEnd();
            string errText = p.StandardError.ReadToEnd();
            p.WaitForExit();

            using (var stream = Console.OpenStandardOutput()) {
                byte[] buf = Encoding.UTF8.GetBytes(outText);
                stream.Write(buf, 0, buf.Length);
            }
            if (p.ExitCode != 0) {
                using (var errStream = Console.OpenStandardError()) {
                    byte[] errBuf = Encoding.UTF8.GetBytes(errText);
                    errStream.Write(errBuf, 0, errBuf.Length);
                }
            }
            return p.ExitCode;
        } catch (Exception ex) {
            using (var errStream = Console.OpenStandardError()) {
                byte[] errBuf = Encoding.UTF8.GetBytes(ex.ToString());
                errStream.Write(errBuf, 0, errBuf.Length);
            }
            return 1;
        }
    }
}
