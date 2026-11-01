# Sandboxing and Secure Code Execution

Sandboxing untrusted code protects systems from injection, privilege escalation, and resource exhaustion. Learn which isolation mechanism fits your workload.

I'm writing this because I spent a week last month staring at isolation options and realized most teams pick one mechanism and stop. That's a mistake. The research is clear: no single mechanism dominates. Layering is what actually buys you security.

## What sandboxing actually does

Sandboxing is the practice of running code in an environment where it can do less damage if something goes wrong. The goal isn't to make code trustworthy. It's to assume the code will misbehave and limit what that misbehavior can reach. A good sandbox answers four questions: what can this code read, what can it write, what can it call, and how much can it consume.

I think of it as a seatbelt. The seatbelt doesn't prevent the crash. It changes the outcome.

## The threat model in plain terms

Before picking a mechanism, name the threats. The main ones I watch for:

- Code injection: an attacker feeds input that executes as code.
- Privilege escalation: a low-privilege process gains higher privileges.
- Information leakage through side channels: timing, cache, or memory leaks data.
- Resource exhaustion: runaway CPU, memory, or file descriptors.

Most real-world breaches don't come from a clever kernel exploit. They come from configuration errors. A seccomp profile that's too permissive. A container running as root. A sandbox that forgot to disable network access. The mechanism matters less than how carefully you configure it.

## The main isolation mechanisms

There are four families I keep coming back to. Each has a sweet spot.

### Process-level isolation: seccomp

seccomp is a Linux kernel feature that restricts which system calls a process can make. In filter mode, you install a small program that evaluates each syscall and decides: allow, deny, trap, or log. Chromium, Docker, and systemd all use it.

The appeal is precision. You allow only the syscalls your app actually needs, which shrinks the kernel attack surface dramatically. The cost is care. An overly permissive profile gives false confidence. An overly restrictive one breaks functionality. seccomp is best for trusted-but-untrusted plugins: code you mostly trust but want to contain.

There's also a newer user-space notification mode, where a supervisor process handles syscalls on behalf of the sandboxed app. That enables dynamic policy decisions and emulation of unavailable calls. It's powerful but adds complexity.

### Container-level isolation: gVisor

gVisor is a user-space kernel. Instead of forwarding syscalls to the host kernel, it intercepts them in a process called the Sentry, which emulates kernel behavior in user space. A minimal Gofer process mediates access to host resources. The trusted computing base exposed to the workload shrinks considerably.

The big win is compatibility. gVisor runs standard OCI containers with little modification and integrates with Docker and Kubernetes. You keep your existing tooling. The downside is syscall-heavy workloads see overhead, since every syscall now goes through emulation. For typical web apps this is fine. For database engines or tight loops, measure before committing.

### Hardware-level isolation: Firecracker

Firecracker is a virtual machine monitor built by AWS for serverless workloads. It uses KVM to run microVMs that boot in tens of milliseconds and consume only a few megabytes of overhead per instance. It removes almost everything: no legacy BIOS, no complex PCI devices, no graphical console. Just a network interface, a block device, and vsock.

This is the option I reach for when tenants are genuinely hostile and multi-tenant. It's the foundation of AWS Lambda and Fargate, so the production track record is real. The tradeoff is you're now managing VMs, not processes. That's more operational weight, but for untrusted code from disparate users it's worth it.

### Language-level isolation: WebAssembly

WebAssembly runs code in a sandboxed linear memory region. Modules can only access a contiguous, bounds-checked memory area. They have no ambient authority: no files, no network, no clock unless the host explicitly grants it. Control flow is structured and type-checked.

I like WebAssembly for plugins, edge functions, and third-party logic. It's portable and deterministic, and the capability model is clean. The catch: WebAssembly alone isn't enough. Host functions and imported APIs can introduce vulnerabilities. The embedder has to sandbox the runtime, validate modules, and enforce resource limits. The model is a foundation, not a complete answer.

## Defense in depth: why layering beats picking one

The survey I read makes one point repeatedly: no single mechanism dominates. The best security-to-performance ratio comes from layering. Combine a minimal kernel attack surface with user-space filtering. That means seccomp on top of namespaces, or gVisor behind a microVM, or WebAssembly inside a container with syscall filtering.

The reason is simple. Each layer catches what the previous one missed. A container escape might still be blocked by seccomp. A seccomp bypass might still be blocked by the microVM boundary. Layers fail independently, which is what you want.

## How to choose

Here's the decision framework I actually use:

1. Trusted plugins in a single app: seccomp profile plus namespaces.
2. Standard containers needing stronger isolation: gVisor.
3. Hostile multi-tenant workloads: Firecracker microVMs.
4. Portable third-party logic or edge functions: WebAssembly, with strict host API gating.

Start with the smallest isolation that meets your threat model. Add layers when you have evidence you need them, not before. And measure: startup latency, memory overhead, and syscall throughput all vary by workload.

## FAQ

### Is WebAssembly safe enough on its own?

No. WebAssembly provides memory safety and a capability model, but host functions and imported APIs can still introduce vulnerabilities. You still need to sandbox the runtime, validate modules, and enforce resource limits.

### When should I use Firecracker instead of containers?

When tenants are genuinely hostile or untrusted and run disparate code. Firecracker gives hardware-level isolation with millisecond startup. For trusted internal workloads, containers are simpler and cheaper.

### Does seccomp replace containers?

No. seccomp restricts syscalls; containers provide filesystem, network, and process isolation through namespaces. They complement each other. Most production setups use both.

### What's the most common sandboxing mistake?

Configuration errors. Overly permissive seccomp profiles, containers running as root, missing network restrictions. The mechanism is rarely the failure point; the configuration is.

Tags: sandboxing, code execution, isolation, security