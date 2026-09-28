fn main() {
    // 16 KB page support for newer Pixels / Android 15+: the Tauri CLI sets its own RUSTFLAGS,
    // which silently overrides .cargo/config.toml, so the link flag has to come from here.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }
    tauri_build::build()
}
