import re

def ipv6(addr):
    """Read an IPv6 address group by group: letters spelled, "::" as "colon colon"."""
    addr, _, plen = addr.partition("/")
    groups = re.split(r"(::|:)", addr)
    words = []
    for g in groups:
        if g == "::": words.append("colon colon")
        elif g == ":": words.append("colon")
        elif g: words.append(" ".join(g.upper()) if re.search(r"[A-Fa-f]", g) else g)
    return " ".join(words) + (f" slash {plen}" if plen else "")
FIX = [  # (regex, spoken)
 # --- Chapters 9 and 10: cloud and content security ---
 (r"\b(?:[a-z0-9-]+\.)+(?:com|org|io|cx|net|gov)/\S*","the link in the notes"),
 (r"\b(?:[a-z0-9-]+\.)+(?:com|org|io|cx|net|gov)\b", lambda m: m.group(0).replace(".", " dot ")),
 (r"ATT&CK","attack"), (r"/usr/local/bin","slash user slash local slash bin"), (r"\$PATH","dollar path"), (r"\bC\.UTF-8\b","C dot U.T.F. 8"),
 (r"\bLANG=C\b","lang equals C"), (r"\b([MPT])(\d)\b", r"\1 \2"), (r"\bC3\b","C 3"), (r"\bF5\b","F 5"), (r"\b110MB\b","110 megabytes"),
 (r"\bENV\b","env"), (r"\bRUN\b","run"), (r"\bFROM\b","from"), (r"\bCMD\b","command"), (r"\bPATH\b","path"), (r"\bLANG\b","lang"),
 (r"\bCASE\b","case"), (r"\bMAIL\b","mail"), (r"\bAsyncOS\b","async O.S."), (r"\bCoreDNS\b","core D.N.S."), (r"\bFedRAMP\b","fed ramp"),
 (r"\bFreeBSD\b","free B.S.D."), (r"\bOpenSSL\b","open S.S.L."), (r"\bDAST\b","dast"), (r"\bSAST\b","sast"), (r"\bDKIM\b","D-kim"),
 (r"\bDMARC\b","D-mark"), (r"\bHELO/EHLO\b","helo and E-helo"), (r"\bS/MIME\b","S mime"), (r"\bMIME\b","mime"), (r"\bWPAD\b","W-pad"),
 (r"\bPAC\b","pac"), (r"\bSOCKS\b","socks"), (r"\bWHOIS\b","who is"), (r"\bEU-U\.S\b","E.U. U.S."), (r"\bBIG-IP\b","big I.P."),
 (r"\bGPOs\b","G.P.O.s"), (r"\bCSPs\b","C.S.P.s"), (r"\bCDNs\b","C.D.N.s"), (r"\bSpring-M[VC][CV]\b","Spring M.V.C."), (r"\bSIEM\b","sim"),
 # --- Chapters 7 and 8: firewalls and VPNs ---
 (r"\bFirePOWER\b","Fire Power"), (r"\bFlexVPN\b","flex V.P.N."), (r"\bGETVPN\b","get V.P.N."), (r"\bEzVPN\b","easy V.P.N."),
 (r"\bmGRE\b","multipoint G.R.E."), (r"\bISAKMP\b","ice-a-camp"), (r"\bSKEYID\b","S key I.D."), (r"\bIDi\b","I.D. I"), (r"\bIDr\b","I.D. R"),
 (r"\bCBAC\b","see-back"), (r"\bNGIPS\b","N.G. I.P.S."), (r"\bClamAV\b","clam A.V."), (r"\bOpenAppID\b","Open App I.D."), (r"\bSecurID\b","secure I.D."),
 (r"\bSunRPC\b","Sun R.P.C."), (r"\bDCE/RPC\b","D.C.E. R.P.C."), (r"\bCI/CD\b","C.I. C.D."), (r"\bWINS\b","wins"), (r"\bHOSTS\b","hosts"),
 (r"\bTEST\b","test"), (r"\bAUTH\b","auth"), (r"\bSASE\b","sassy"), (r"\bSOAR\b","soar"), (r"\bWAFs\b","waffs"), (r"\bWAF\b","waff"),
 (r"\bSCADA\b","scada"), (r"\bDNP3\b","D.N.P. 3"), (r"\bISA3000\b","I.S.A. 3000"), (r"\b5506([HW])-X\b",r"55 oh 6 \1 X"),
 (r"\bSAs\b","S.A.s"), (r"\bSPIs\b","S.P.I.s"), (r"\bVSAs\b","V.S.A.s"), (r"\bsVTI\b","static V.T.I."), (r"\bdVTI\b","dynamic V.T.I."),
 (r"\biOS\b","eye O.S."), (r"\bmacOS\b","mac O.S."), (r"\buCPE\b","U.C.P.E."), (r"\bvFTD\b","virtual F.T.D."), (r"\bFTDs\b","F.T.D.s"),
 (r"\bDMZs\b","D.M.Z.s"), (r"\bACEs\b","A.C.E.s"), (r"\bSRUs\b","S.R.U.s"), (r"\bL2TP\b","L 2 T.P."), (r"\bL2F\b","L 2 F"),
 (r"\bPOP3\b","pop 3"), (r"\bPOP\b","pop"), (r"\bIMAP4\b","eye-map 4"), (r"\bIMAP\b","eye-map"), (r"\bDH(\d)\b",r"D.H. \1"), (r"\bD-H\b","D.H."),
 (r"\bMM(\d)\b",r"M.M. \1"), (r"\bTCAM\b","T-cam"), (r"\bNY-ASA\b","New York A.S.A."), (r"\bNY\b","New York"),
 (r"\bsecretcorp-RA-VPN-policy\b","secret corp R.A. V.P.N. policy"), (r"\bDefaultL2LGroup\b","Default L 2 L Group"), (r"\bCERTREQ\b","cert req"),
 (r"\bDOCX\b","doc X"), (r"\bPPTX\b","P.P.T.X."), (r"\bXLSX\b","X.L.S.X."), (r"\bJAR\b","jar"), (r"\bZIP\b","zip"),
 # --- Chapters 5 and 6: visibility, segmentation, infrastructure security ---
 (r"\b[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,}(?:/\d+)?", lambda m: ipv6(m.group(0))),
 (r"\bGigabitEthernet(\d+)/(\d+)", r"gigabit ethernet \1 slash \2"), (r"\bGigabit(\d+)/(\d+)", r"gigabit \1 slash \2"),
 (r"\bGi(\d+)/(\d+)", r"gig \1 slash \2"), (r"(\d)/(\d)", r"\1 slash \2"),
 (r"\bSW(\d)\b", r"S.W. \1"), (r"\bR(\d)\b", r"R \1"), (r"\bC800\b","C 800"), (r"\bC8\b","C 8"), (r"\bSCOR\b","score"), (r"\bCCNP\b","C.C.N.P."),
 (r"\bCAPWAP\b","cap-wap"), (r"\bLWAPP\b","L-wap"), (r"\bBOOTP\b","boot P"), (r"\bNBAR\b","N-bar"), (r"\bCoPP\b","cop"), (r"\bCPPr\b","C.P.P.R."),
 (r"\bIPFIX\b","I.P. fix"), (r"\bNVRAM\b","N.V. ram"), (r"\bSPAN\b","span"), (r"\bTAP\b","tap"), (r"\bNAT\b","nat"), (r"\bPAT\b","pat"),
 (r"\bCAM\b","cam"), (r"\bMIB\b","mib"), (r"\bSeND\b","send"), (r"\bRH0\b","R.H. zero"), (r"\bEUI-64\b","E.U.I. 64"), (r"\bARP\b","arp"),
 (r"\bMOP\b","mop"), (r"\bPAD\b","pad"), (r"\bAUX\b","aux"), (r"\bEXEC\b","exec"), (r"\bFAIL\b","fail"), (r"\bPASS\b","pass"),
 (r"\bLINEPROTO-5-UPDOWN\b","line proto 5 up down"), (r"\bLINK-3-UPDOWN\b","link 3 up down"), (r"\bMY-AUTHEN-LIST-1\b","my authen list 1"),
 (r"\bLAB-Router\b","lab router"), (r"\bWRED\b","W-red"), (r"\bACK\b","ack"), (r"\bvNIC\b","V-nic"), (r"\bALGs\b","A.L.G.s"), (r"\bIPSs\b","I.P.S.s"),
 (r"\bVRFs\b","V.R.F.s"), (r"\bEPGs\b","E.P.G.s"), (r"\bIEPGs\b","I.E.P.G.s"), (r"\bEEPGs\b","E.E.P.G.s"), (r"\bBPDUs\b","B.P.D.U.s"),
 (r"\bAPs\b","A.P.s"), (r"\bASRs\b","A.S.R.s"), (r"\bISRs\b","I.S.R.s"), (r"\bWLCs\b","W.L.C.s"), (r"\bASNs\b","A.S.N.s"), (r"\bIGPs\b","I.G.P.s"),
 (r"\bMPs\b","M.P.s"), (r"\bPassiveID\b","passive I.D."), (r"\bDB8\b","D B 8"),
 # --- Chapters 3 and 4: SDN, programmability, AAA (most-specific first) ---
 (r"https?://\S+","the link in the notes"), (r"www\.\S+","the link in the notes"),
 (r"\bTACACS\+","tack-acks plus"), (r"\bTACACS\b","tack-acks"), (r"\bRADIUS\b","radius"), (r"\bDiameter\b","diameter"),
 (r"\bEAPoL\b","E-pole"), (r"\bEAP-TLS\b","eep T.L.S."), (r"\bEAP\b","eep"), (r"\bMACsec\b","mac-sec"), (r"\bMACs\b","macs"), (r"\bMAC\b","mac"),
 (r"\bMAB\b","mab"), (r"\bISE\b","ice"), (r"\bpxGrid\b","P.X. grid"), (r"\bSAML\b","sam-ul"), (r"\bOIDC\b","O.I.D.C."),
 (r"\bJWTs\b","jots"), (r"\bJWT\b","jot"), (r"\bNETCONF\b","net-conf"), (r"\bRESTCONF\b","rest-conf"), (r"\bYANG\b","yang"),
 (r"\bgNMI\b","G.N.M.I."), (r"\bOpenAPI\b","Open A.P.I."), (r"\bOpenDNS\b","Open D.N.S."), (r"\bSD-WAN\b","S.D. wan"),
 (r"\bVXLAN\b","V.X. lan"), (r"\bVLANs\b","V-lans"), (r"\bVLAN\b","V-lan"), (r"\bWLAN\b","W-lan"), (r"\bLAN\b","lan"), (r"\bWAN\b","wan"),
 (r"\bAPICs\b","A-picks"), (r"\bAPIC\b","A-pick"), (r"\bACI\b","A.C.I."), (r"\bOVSDB\b","O.V.S. D.B."), (r"\bOPNFV\b","O.P.N.F.V."),
 (r"\bNFVI\b","N.F.V.I."), (r"\bNFV\b","N.F.V."), (r"\bVNFs?\b","V.N.F."), (r"\bMANO\b","mano"), (r"\bESXi\b","E.S.X.I."),
 (r"\bC3PL\b","C 3 P L"), (r"\bdACLs\b","D-A.C.L.s"), (r"\bdACL\b","D-A.C.L."), (r"\bSGACLs\b","S.G. A.C.L.s"), (r"\bSGACL\b","S.G. A.C.L."),
 (r"\bIP-to-SGT\b","I.P. to S.G.T."), (r"\bSGTs\b","S.G.T.s"), (r"\bSGT\b","S.G.T."), (r"\bPSNs\b","P.S.N.s"), (r"\bS-MNT\b","secondary M.N.T."),
 (r"\bCSR-1000v\b","C.S.R. 1000 V"), (r"\bIOS-XE\b","I.O.S. X.E."), (r"\bIOS\b","I.O.S."), (r"\bERSPAN\b","E.R. span"),
 (r"\bCHAP\b","chap"), (r"\bPAP\b","pap"), (r"\bAVPs\b","A.V.P.s"), (r"\b802\.1AE\b","802 dot 1 A.E."), (r"\bABAC\b","A-back"),
 (r"\bRBAC\b","R-back"), (r"\bVoIP\b","voice over I.P."), (r"\bDCOM\b","D-com"), (r"\bRRRRIRRR\b","R R R R I R R R"), (r"\bSWIM\b","swim"),
 (r"\bVERIS\b","veris"), (r"\bACCESS-ACCEPT\b","access accept"), (r"\bACCESS-REQUEST\b","access request"), (r"\bREPLY\b","reply"),
 (r"\bCONTINUE\b","continue"), (r"\bSTART\b","start"), (r"\bENABLED\b","enabled"), (r"\bGET\b","get"), (r"\bPUT\b","put"),
 (r"\bPOST\b","post"), (r"\bPATCH\b","patch"), (r"\bDELETE\b","delete"), (r"\bR1\b","R 1"), (r"\bNGFWs\b","N.G.F.W.s"),
 # --- Chapter 2 crypto terms (most-specific first) ---
 (r"\b3DES\b","triple D.E.S."), (r"\bHMAC-MD5\b","H-mac M.D. 5"), (r"\bHMAC-SHA-1\b","H-mac SHA 1"),
 (r"\bHMAC\b","H-mac"), (r"\bSHA-?512\b","SHA 512"), (r"\bSHA-?384\b","SHA 384"), (r"\bSHA-?256\b","SHA 256"),
 (r"\bSHA-?224\b","SHA 224"), (r"\bSHA-?3\b","SHA 3"), (r"\bSHA-?2\b","SHA 2"), (r"\bSHA-?1\b","SHA 1"), (r"\bSHA\b","SHA"),
 (r"\bBLAKE2\b","blake 2"), (r"\bCRYSTALS\b","crystals"), (r"\bECDSA\b","E.C.D.S.A."), (r"\bECDH\b","E.C.D.H."),
 (r"\bECC\b","E.C.C."), (r"\bDiffie-Hellman\b","Diffie Hellman"), (r"\bDH\b","D.H."), (r"\bIPsec\b","I.P. sec"),
 (r"\bIKE\b","I.K.E."), (r"\bESP\b","E.S.P."), (r"\bAH\b","A.H."), (r"\bGCM\b","G.C.M."), (r"\bPKCS\b","P.K.C.S."),
 (r"\bPKI\b","P.K.I."), (r"\bOCSP\b","O.C.S.P."), (r"\bSCEP\b","skep"), (r"\bCRLs\b","C.R.L.s"), (r"\bCRL\b","C.R.L."),
 (r"\bCAs\b","C.A.s"), (r"\bCA\b","C.A."), (r"\bX\.509v3\b","X 509 version 3"), (r"\bX\.509\b","X 509"),
 (r"\bX\.500\b","X 500"), (r"\b802\.1X\b","802 dot 1 X"), (r"\bAAA\b","triple A"), (r"\bFQDN\b","F.Q.D.N."),
 (r"\bLDAP\b","L-dap"), (r"\bPGP\b","P.G.P."), (r"\bNTP\b","N.T.P."), (r"\bPSKs\b","P.S.K.s"), (r"\bPSK\b","P.S.K."),
 (r"\bPCs\b","P.C.s"), (r"\bPC\b","P.C."), (r"\bCN\b","C.N."), (r"\bOU\b","O.U."), (r"\bIDEA\b","I.D.E.A."),
 (r"ISO/IEC", "I.S.O. I.E.C."), (r"ISO/PAS","I.S.O. PAS"), (r"ISO27k","I.S.O. 27 K"), (r"\bISO\b","I.S.O."),
 (r"\bSP 800\b","S.P. 800"), (r"\bSP 1800\b","S.P. 1800"), (r"\bSPs\b","S.P.s"), (r"\bSP\b","S.P."),
 (r"\bNISTIR\b","NIST I.R."), (r"\bISMS\b","I.S.M.S."), (r"US-CERT","U S cert"), (r"\bU\.S\.","U.S."),
 (r"CERT/SEI","CERT, S.E.I."), (r"CERT-In","CERT In"), (r"\bDoS/DDoS\b","D.O.S. and D.D.O.S."),
 (r"\bDDoS\b","D.D.O.S."), (r"\bDoS\b","D.O.S."), (r"\bDoD\b","D.O.D."), (r"DR/BCP","D.R. and B.C.P."),
 (r"HTTP/HTTPS","HTTP and HTTPS"), (r"\bIoT\b","I.O.T."), (r"\bIoCs\b","I.O.C.s"), (r"\bIaaS\b","I.A.A.S."),
 (r"\bPaaS\b","PAZ"), (r"\bSaaS\b","SASS"), (r"\bRaaS\b","ransomware as a service"), (r"\bIPv6\b","I.P. version 6"),
 (r"\bIPv4\b","I.P. version 4"), (r"\bret2libc\b","return to lib C"), (r"\bRet2Libc\b","return to lib C"),
 (r"\bROT13\b","rot 13"), (r"\bMD5\b","M.D. 5"), (r"\bRC4\b","R.C. 4"), (r"\bC2\b","C 2"), (r"\bA10\b","A 10"),
 (r"\bLRWPAN\b","L.R. W-PAN"), (r"\bLoRaWAN\b","LoRa WAN"), (r"\bOWASP\b","oh-wasp"), (r"\bSQL\b","sequel"),
 (r"\bSSVC\b","S.S.V.C."), (r"\bCVSS\b","C.V.S.S."), (r"\bInfoSec\b","info-sec"), (r"\bXSS\b","cross-site scripting"),
 (r"\bCSRF\b","C.S.R.F."), (r"\bSSRF\b","S.S.R.F."), (r"\bIDOR\b","I.D.O.R."), (r"\bSYN\b","sin"), (r"\bGUI\b","gooey"),
 (r"\bOAuth\b","oh-auth"), (r"\bWADL\b","waddle"), (r"\bWSDL\b","wiz-dull"), (r"\bSOAP\b","soap"), (r"\bREST\b","rest"),
 (r"\bRESTful\b","restful"), (r"\bJSON\b","jay-son"), (r"\bSTIX\b","sticks"), (r"\bTAXII\b","taxi"), (r"\bMITRE\b","my-ter"),
 (r"\bCISA\b","SIS-uh"), (r"\bFIPS\b","fips"), (r"\bCOBIT\b","co-bit"), (r"\bITIL\b","eye-till"), (r"\bCORBA\b","cor-ba"),
 (r"\bNATAS\b","nah-tahs"), (r"\bWEP\b","wep"), (r"\bMQTT\b","M.Q.T.T."), (r"\bCoAP\b","co-app"), (r"\bAMQP\b","A.M.Q.P."),
 (r"\bXMPP\b","X.M.P.P."), (r"\bDOM\b","dom"), (r"DOM-based","dom-based"), (r"\bOpenC2\b","Open C 2"), (r"\bOAS\b","O.A.S."),
 (r"\bCNAs\b","C.N.A.s"), (r"\bPSIRTs\b","P-certs"), (r"\bPSIRT\b","P-cert"), (r"\bCSIRTs\b","C-certs"), (r"\bCSIRT\b","C-cert"),
 (r"\bCERTs\b","certs"), (r"\bCERT\b","cert"), (r"\bAusCERT\b","Aus cert"), (r"\bRAM\b","ram"), (r"\bRSA\b","R.S.A."),
 (r"\bAES\b","A.E.S."), (r"\bDES\b","D.E.S."), (r"\bSLAs\b","S.L.A.s"), (r"\bACLs\b","A.C.L.s"), (r"\bVPNs\b","V.P.N.s"),
 (r"\bLANs\b","lans"), (r"\bAPIs\b","A.P.I.s"), (r"\bURLs\b","U.R.L.s"), (r"\bIPs\b","I.P.s"), (r"\bISPs\b","I.S.P.s"),
 (r"\bIDs\b","I.D.s"), (r"\bCERTs\b","certs"), (r"\bOS\b","O.S."), (r"\bIT\b","I.T."), (r"\bAI\b","A.I."), (r"\bML\b","M.L."),
 (r"\be\.g\.,?","for example,"), (r"\bi\.e\.,?","that is,"), (r"\bvs\.","versus"), (r"&"," and "), (r"→"," leads to "),
]
def speak(t):
    for a,b in FIX: t=re.sub(a,b,t)
    t=t.replace("/"," or ").replace("–",", ").replace("—",", ")
    t=re.sub(r"\.\.",".",t)
    return re.sub(r"\s+"," ",t).strip()
